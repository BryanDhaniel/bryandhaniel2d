"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { CSM } from "three/examples/jsm/csm/CSM.js";
import { SUN, WEATHER } from "@/game3d/config/visuals";
import { useRuntime } from "@/game3d/runtime";

/**
 * Cascaded shadow maps for the third-person view on High: the view frustum is split into
 * cascades (sharp near the player, coarse in the distance), each with its own texel-snapped
 * directional shadow map, so shadows stay crisp up close and still reach the horizon.
 *
 * three's CSM helper supplies the cascade lights and the shader chunks, but its material setup
 * replaces onBeforeCompile, which would drop this village's own shader patches. So materials
 * are opted in here instead: the CSM defines are added and onBeforeCompile is wrapped (not
 * replaced), and every compiled variant shares one set of cascade uniforms.
 */

const LIT = (
  material: THREE.Material,
): material is THREE.MeshStandardMaterial | THREE.MeshLambertMaterial | THREE.MeshPhongMaterial =>
  material instanceof THREE.MeshStandardMaterial ||
  material instanceof THREE.MeshLambertMaterial ||
  material instanceof THREE.MeshPhongMaterial;

/** Upper bound on cascades: the shared array is pre-sized, since shaders read it on their first draw. */
const MAX_CASCADES = 4;

/** Cascade uniforms shared by every opted-in material (one update reaches them all). */
const SHARED = {
  CSM_cascades: { value: Array.from({ length: MAX_CASCADES }, () => new THREE.Vector2(0, 1)) },
  cameraNear: { value: 0.1 },
  shadowFar: { value: 50 },
};

/** Materials whose onBeforeCompile already carries the cascade uniforms. */
const wrapped = new WeakSet<THREE.Material>();

function optIn(material: THREE.Material, cascades: number): void {
  if (!LIT(material)) return;
  if (!wrapped.has(material)) {
    wrapped.add(material);
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      // Always present (harmless without USE_CSM), so switching variants never loses them.
      Object.assign(shader.uniforms, SHARED);
    };
  }
  const defines: Record<string, unknown> = { ...(material.defines ?? {}) };
  if (defines.USE_CSM === 1 && defines.CSM_CASCADES === cascades) return;
  defines.USE_CSM = 1;
  defines.CSM_CASCADES = cascades;
  defines.CSM_FADE = "";
  material.defines = defines;
  material.needsUpdate = true;
}

function optOut(material: THREE.Material): void {
  if (!LIT(material) || !material.defines || !("USE_CSM" in material.defines)) return;
  const defines: Record<string, unknown> = { ...material.defines };
  delete defines.USE_CSM;
  delete defines.CSM_CASCADES;
  delete defines.CSM_FADE;
  material.defines = defines;
  material.needsUpdate = true;
}

function eachMaterial(scene: THREE.Object3D, visit: (material: THREE.Material) => void): void {
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material as THREE.Material | THREE.Material[];
    if (Array.isArray(material)) material.forEach(visit);
    else visit(material);
  });
}

/** How often (seconds) new meshes (a loaded model, say) are looked for and opted in. */
const RESCAN_EVERY = 1.5;

export function CascadedShadows({ mapSize }: { mapSize: number }) {
  const runtime = useRuntime();
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);

  const csm = useMemo(() => {
    const instance = new CSM({
      camera,
      parent: scene,
      cascades: Math.min(SUN.cascades, MAX_CASCADES),
      maxFar: SUN.cascadeFar,
      mode: "practical",
      shadowMapSize: mapSize,
      shadowBias: SUN.bias,
      lightDirection: new THREE.Vector3(-0.3, -1, -0.3).normalize(),
      lightIntensity: 1,
      lightMargin: SUN.cascadeMargin,
    });
    instance.fade = true;
    for (const light of instance.lights) {
      light.shadow.normalBias = SUN.normalBias;
      light.shadow.radius = SUN.radius;
    }
    return instance;
  }, [camera, scene, mapSize]);

  const scratch = useMemo(() => ({ rescan: 0, fov: 0, aspect: 0 }), []);

  useEffect(() => {
    eachMaterial(scene, (material) => optIn(material, csm.cascades));
    return () => {
      eachMaterial(scene, optOut);
      csm.remove();
      for (const light of csm.lights) {
        light.shadow.map?.dispose();
        light.dispose();
      }
    };
  }, [scene, csm]);

  useFrame((_, delta) => {
    const state = runtime.cycle.state;
    const sun = state.sunDirection;
    const dim = 1 - (1 - WEATHER.rain.dim) * runtime.weather.rain;
    csm.lightDirection.set(-(sun[0] ?? 0), -(sun[1] ?? 1), -(sun[2] ?? 0)).normalize();
    for (const light of csm.lights) {
      light.color.setRGB(state.sunColor[0] ?? 1, state.sunColor[1] ?? 1, state.sunColor[2] ?? 1);
      light.intensity = state.sunIntensity * dim;
      light.shadow.bias = runtime.tuning.shadowBias;
      light.shadow.normalBias = runtime.tuning.shadowNormalBias;
    }
    // The run FOV kick and resizes change the frustum: re-split the cascades.
    if (
      camera instanceof THREE.PerspectiveCamera &&
      (camera.fov !== scratch.fov || camera.aspect !== scratch.aspect)
    ) {
      scratch.fov = camera.fov;
      scratch.aspect = camera.aspect;
      csm.updateFrustums();
    }
    csm.update();
    // The cascade ranges every opted-in material reads.
    const breaks = SHARED.CSM_cascades.value;
    for (let i = 0; i < Math.min(csm.breaks.length, MAX_CASCADES); i += 1) {
      breaks[i]?.set(csm.breaks[i - 1] ?? 0, csm.breaks[i] ?? 1);
    }
    SHARED.cameraNear.value = camera.near;
    SHARED.shadowFar.value = Math.min(camera.far, csm.maxFar);
    scratch.rescan += delta;
    if (scratch.rescan > RESCAN_EVERY) {
      scratch.rescan = 0;
      eachMaterial(scene, (material) => optIn(material, csm.cascades));
    }
  });

  return null;
}
