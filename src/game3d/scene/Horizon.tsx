"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { PALETTE } from "@/game/palette";
import { useRuntime } from "@/game3d/runtime";
import { patchMaterial } from "@/game3d/shaders/patch";
import { buildBackdrop, buildLandGeometry, buildMountains, outerTrees } from "./horizonGeometry";

const HAZE_VERTEX = /* glsl */ `
varying vec3 vColor;
varying vec3 vNormalW;
varying float vHeight;
void main() {
  vColor = color;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vHeight = position.y;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

const HAZE_FRAGMENT = /* glsl */ `
uniform vec3 uLight;
uniform vec3 uSunDir;
uniform vec3 uHaze;
uniform float uHazeBase;
uniform float uHazeLow;
varying vec3 vColor;
varying vec3 vNormalW;
varying float vHeight;
void main() {
  float lambert = 0.55 + 0.45 * max(dot(normalize(vNormalW), normalize(uSunDir)), 0.0);
  vec3 lit = vColor * uLight * lambert;
  // Aerial perspective: everything this far away melts into the sky, the feet more than the peaks.
  float haze = clamp(uHazeBase + uHazeLow * (1.0 - smoothstep(-4.0, 34.0, vHeight)), 0.0, 1.0);
  gl_FragColor = vec4(mix(lit, uHaze, haze), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function hazeMaterial(hazeBase: number, hazeLow: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLight: { value: new THREE.Color(1, 1, 1) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uHaze: { value: new THREE.Color() },
      uHazeBase: { value: hazeBase },
      uHazeLow: { value: hazeLow },
    },
    vertexShader: HAZE_VERTEX,
    fragmentShader: HAZE_FRAGMENT,
    vertexColors: true,
    fog: false,
  });
}

/** A low-poly tree with its colours baked in: a cone pine or a round broadleaf on a trunk. */
function treeGeometry(pine: boolean): THREE.BufferGeometry {
  const crown = (
    pine ? new THREE.ConeGeometry(0.85, 2.4, 6) : new THREE.IcosahedronGeometry(1.05, 0)
  )
    .toNonIndexed()
    .translate(0, pine ? 2.0 : 2.1, 0);
  const trunk = new THREE.CylinderGeometry(0.1, 0.16, 1.1, 5).toNonIndexed().translate(0, 0.55, 0);
  const paint = (geometry: THREE.BufferGeometry, hex: string) => {
    const tint = new THREE.Color(hex);
    const count = geometry.getAttribute("position").count;
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(
        Array.from({ length: count * 3 }, (_, i) => [tint.r, tint.g, tint.b][i % 3] ?? 0),
        3,
      ),
    );
  };
  paint(crown, pine ? PALETTE.forest : PALETTE.leaf);
  paint(trunk, PALETTE.bark);
  const positions: number[] = [];
  const colors: number[] = [];
  for (const part of [crown, trunk]) {
    const position = part.getAttribute("position");
    const tint = part.getAttribute("color");
    for (let i = 0; i < position.count; i += 1) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      colors.push(tint.getX(i), tint.getY(i), tint.getZ(i));
    }
    part.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The world beyond the village for the third-person view: hills and cliffs on every side, the
 * forest running on past the border, a lake, a ring of mountains and a far hazy range. The
 * land and trees take the scene's fog and cloud shadows; the mountains fade into the sky
 * colour by their own haze. Hidden in the isometric view, which keeps the floating diorama.
 */
export function Horizon() {
  const runtime = useRuntime();
  const { layout } = runtime;

  const world = useMemo(() => {
    const centreX = layout.width / 2;
    const centreZ = layout.height / 2;
    const land = new THREE.Mesh(
      buildLandGeometry(layout.width, layout.height),
      patchMaterial(
        new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
        runtime.uniforms,
        {
          clouds: true,
        },
      ),
    );
    land.receiveShadow = true;
    const treeMaterial = patchMaterial(
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      runtime.uniforms,
      {
        clouds: true,
        wind: "foliage",
      },
    );
    const placements = outerTrees(layout.width, layout.height);
    const forests = [true, false].map((pine) => {
      const list = placements.filter((tree) => tree.pine === pine);
      const mesh = new THREE.InstancedMesh(
        treeGeometry(pine),
        treeMaterial,
        Math.max(1, list.length),
      );
      const matrix = new THREE.Matrix4();
      const rotation = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const position = new THREE.Vector3();
      const scale = new THREE.Vector3();
      list.forEach((tree, i) => {
        rotation.setFromAxisAngle(up, tree.rotation);
        position.set(tree.x, tree.y, tree.z);
        scale.setScalar(tree.scale);
        mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
      });
      mesh.count = list.length;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      return mesh;
    });
    const mountains = new THREE.Mesh(buildMountains(centreX, centreZ), hazeMaterial(0.32, 0.38));
    const backdrop = new THREE.Mesh(buildBackdrop(centreX, centreZ), hazeMaterial(0.62, 0.3));
    for (const far of [mountains, backdrop]) far.renderOrder = -10;
    const group = new THREE.Group();
    group.add(land, ...forests, mountains, backdrop);
    group.visible = false;
    return { group, land, forests, treeMaterial, far: [mountains, backdrop] };
  }, [layout, runtime.uniforms]);

  useEffect(
    () => () => {
      world.land.geometry.dispose();
      (world.land.material as THREE.Material).dispose();
      for (const forest of world.forests) {
        forest.geometry.dispose();
        forest.dispose();
      }
      world.treeMaterial.dispose();
      for (const far of world.far) {
        far.geometry.dispose();
        (far.material as THREE.Material).dispose();
      }
    },
    [world],
  );

  useFrame(() => {
    world.group.visible = runtime.camera.perspective;
    if (!world.group.visible) return;
    const state = runtime.cycle.state;
    const light = Math.max(0.18, state.hemiIntensity * 0.9 + state.sunIntensity * 0.22);
    for (const far of world.far) {
      const u = (far.material as THREE.ShaderMaterial).uniforms;
      (u.uLight?.value as THREE.Color).setRGB(light, light, light * 1.04);
      (u.uSunDir?.value as THREE.Vector3).set(
        state.sunDirection[0] ?? 0,
        state.sunDirection[1] ?? 1,
        state.sunDirection[2] ?? 0,
      );
      (u.uHaze?.value as THREE.Color).setRGB(
        state.skyHorizon[0] ?? 0,
        state.skyHorizon[1] ?? 0,
        state.skyHorizon[2] ?? 0,
      );
    }
  });

  return <primitive object={world.group} />;
}
