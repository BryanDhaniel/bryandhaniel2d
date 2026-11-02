"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useStore } from "zustand";
import { HORIZON, QUALITY_TIERS, WATER, WORLD } from "@/game3d/config/visuals";
import { useRuntime } from "@/game3d/runtime";
import { computeShoreDistance, createWaterMaterial, waterUniforms } from "@/game3d/shaders/water";

const REFLECT_NORMAL = new THREE.Vector3(0, 1, 0);

/**
 * Ponds, the creek, the fountain basin and (seen from third-person) the lake beyond the hills: a custom water shader (pixel-snapped ripples,
 * fresnel, sun glints, sparkles, depth tint and shoreline foam). On High a low-resolution
 * planar reflection of the village is rendered each frame; other tiers fake it with the sky.
 */
export function Water() {
  const runtime = useRuntime();
  const level = useStore(runtime.store, (state) => state.level);
  const reflections = QUALITY_TIERS[level].reflections;
  const { layout } = runtime;
  const pond = useRef<THREE.Mesh>(null);
  const basin = useRef<THREE.Mesh>(null);
  const lakeRef = useRef<THREE.Mesh>(null);

  const resources = useMemo(() => {
    const positions: number[] = [];
    const y = WORLD.waterLevel;
    layout.village.ground.forEach((ground, index) => {
      if (ground !== "water" && ground !== "bridge") return;
      const x = index % layout.width;
      const z = Math.floor(index / layout.width);
      positions.push(x, y, z, x, y, z + 1, x + 1, y, z + 1, x, y, z, x + 1, y, z + 1, x + 1, y, z);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const shore = new THREE.DataTexture(
      computeShoreDistance(layout),
      layout.width * WATER.shoreResolution,
      layout.height * WATER.shoreResolution,
      THREE.RedFormat,
    );
    shore.magFilter = THREE.LinearFilter;
    shore.minFilter = THREE.LinearFilter;
    shore.needsUpdate = true;
    const material = createWaterMaterial(shore, layout);
    const fountainMaterial = createWaterMaterial(null, layout);
    const fountain = layout.fountain;
    if (fountain) {
      waterUniforms(fountainMaterial).uBasin.value.set(
        fountain.x,
        fountain.z,
        fountain.radius * 0.78,
      );
    }
    const disc = new THREE.CircleGeometry(fountain ? fountain.radius * 0.78 : 0.5, 20);
    disc.rotateX(-Math.PI / 2);
    // The lake: a flat sheet at the water line; the hills around it hide its outer edge.
    const { lake } = HORIZON;
    const lakeMaterial = createWaterMaterial(null, layout);
    waterUniforms(lakeMaterial).uBasin.value.set(lake.x, lake.z, (lake.radiusX + lake.radiusZ) / 2);
    const lakeDisc = new THREE.CircleGeometry(lake.radiusX + 1.5, 48).scale(
      1,
      (lake.radiusZ + 1.5) / (lake.radiusX + 1.5),
      1,
    );
    lakeDisc.rotateX(-Math.PI / 2);
    return {
      geometry,
      shore,
      material,
      fountainMaterial,
      lakeMaterial,
      disc,
      lakeDisc,
      materials: [material, fountainMaterial, lakeMaterial],
    };
  }, [layout]);

  const reflection = useMemo(() => {
    if (!reflections) return null;
    const target = new THREE.WebGLRenderTarget(WATER.reflectionSize, WATER.reflectionSize, {
      type: THREE.HalfFloatType,
    });
    return {
      target,
      ortho: new THREE.OrthographicCamera(),
      perspective: new THREE.PerspectiveCamera(),
      matrix: new THREE.Matrix4(),
    };
  }, [reflections]);

  useEffect(
    () => () => {
      resources.geometry.dispose();
      resources.disc.dispose();
      resources.shore.dispose();
      resources.material.dispose();
      resources.fountainMaterial.dispose();
      resources.lakeMaterial.dispose();
      resources.lakeDisc.dispose();
    },
    [resources],
  );
  useEffect(() => () => reflection?.target.dispose(), [reflection]);

  const scratch = useMemo(
    () => ({
      view: new THREE.Vector3(),
      target: new THREE.Vector3(),
      position: new THREE.Vector3(),
      look: new THREE.Vector3(),
      up: new THREE.Vector3(),
      plane: new THREE.Vector3(0, WORLD.waterLevel, 0),
      forward: new THREE.Vector3(),
    }),
    [],
  );

  useFrame(({ gl, scene, camera, size }) => {
    if (lakeRef.current) lakeRef.current.visible = runtime.camera.perspective;
    const state = runtime.cycle.state;
    const sun = state.sunDirection;
    camera.getWorldDirection(scratch.forward);
    const light =
      Math.max(
        0.12,
        state.hemiIntensity * 0.8 + state.sunIntensity * Math.max(sun[1] ?? 0, 0) * 0.32,
      ) *
      (0.65 + 0.35 * state.daylight);
    for (const material of resources.materials) {
      const u = waterUniforms(material);
      u.uTime.value = runtime.reducedMotion ? 0 : runtime.elapsed;
      u.uLight.value.setRGB(light, light, light);
      u.uSunDir.value.set(sun[0] ?? 0, sun[1] ?? 1, sun[2] ?? 0);
      u.uSunColor.value
        .setRGB(state.sunColor[0] ?? 1, state.sunColor[1] ?? 1, state.sunColor[2] ?? 1)
        .multiplyScalar(state.sunIntensity * 0.45);
      u.uSkyTop.value.setRGB(state.skyTop[0] ?? 0, state.skyTop[1] ?? 0, state.skyTop[2] ?? 0);
      u.uSkyHorizon.value.setRGB(
        state.skyHorizon[0] ?? 0,
        state.skyHorizon[1] ?? 0,
        state.skyHorizon[2] ?? 0,
      );
      u.uViewDir.value.copy(scratch.forward);
      u.uDaylight.value = state.daylight;
      u.uRain.value = runtime.weather.rain;
    }
    const u = waterUniforms(resources.material);
    const ortho = camera instanceof THREE.OrthographicCamera;
    if (!reflection || !(ortho || camera instanceof THREE.PerspectiveCamera)) {
      u.uUseReflection.value = 0;
      return;
    }
    // Mirror the camera in the water plane (as three's Reflector does) and render the
    // village into the low-resolution target with the water hidden.
    const { position, look, up, view, target, plane } = scratch;
    position.setFromMatrixPosition(camera.matrixWorld);
    view.subVectors(plane, position).reflect(REFLECT_NORMAL).negate().add(plane);
    look.copy(position).add(scratch.forward);
    target.subVectors(plane, look).reflect(REFLECT_NORMAL).negate().add(plane);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion).reflect(REFLECT_NORMAL);
    // The mirror camera copies the view's projection (orthographic, or perspective in third-person).
    let mirror: THREE.OrthographicCamera | THREE.PerspectiveCamera;
    if (camera instanceof THREE.OrthographicCamera) {
      const flat = reflection.ortho;
      flat.left = camera.left;
      flat.right = camera.right;
      flat.top = camera.top;
      flat.bottom = camera.bottom;
      flat.zoom = camera.zoom;
      mirror = flat;
    } else {
      const lens = reflection.perspective;
      lens.fov = camera.fov;
      lens.aspect = camera.aspect;
      lens.zoom = camera.zoom;
      mirror = lens;
    }
    mirror.near = camera.near;
    mirror.far = camera.far;
    mirror.position.copy(view);
    mirror.up.copy(up);
    mirror.lookAt(target);
    mirror.updateProjectionMatrix();
    mirror.updateMatrixWorld();
    const height = Math.max(
      1,
      Math.round((WATER.reflectionSize * size.height) / Math.max(1, size.width)),
    );
    if (reflection.target.height !== height)
      reflection.target.setSize(WATER.reflectionSize, height);
    reflection.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    reflection.matrix.multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
    if (pond.current) pond.current.visible = false;
    if (basin.current) basin.current.visible = false;
    const autoUpdate = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;
    gl.setRenderTarget(reflection.target);
    gl.clear();
    gl.render(scene, mirror);
    // Back to the default target: the frame's real render (or the composer) sets its own, and
    // a target left over from a rebuilt composer may already be disposed.
    gl.setRenderTarget(null);
    gl.shadowMap.autoUpdate = autoUpdate;
    if (pond.current) pond.current.visible = true;
    if (basin.current) basin.current.visible = true;
    u.uReflection.value = reflection.target.texture;
    u.uReflectionMatrix.value.copy(reflection.matrix);
    u.uUseReflection.value = 1;
  });

  const fountain = layout.fountain;
  return (
    <group>
      <mesh
        ref={lakeRef}
        geometry={resources.lakeDisc}
        material={resources.lakeMaterial}
        position={[HORIZON.lake.x, WORLD.waterLevel, HORIZON.lake.z]}
        visible={false}
      />
      <mesh ref={pond} geometry={resources.geometry} material={resources.material} />
      {fountain ? (
        <mesh
          ref={basin}
          geometry={resources.disc}
          material={resources.fountainMaterial}
          position={[fountain.x, WORLD.plazaHeight + 0.32, fountain.z]}
        />
      ) : null}
    </group>
  );
}
