"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { hash2 } from "@/game/art/pixels";
import { blob } from "@/game3d/entities/kit";
import { useRuntime } from "@/game3d/runtime";
import { useAssets } from "@/game3d/scene/assets";
import { groundHeight } from "@/game3d/world/layout";

/** The share of border-forest tiles the layout leaves without a tree (see world/layout.ts). */
const TREE_GAP = 0.82;

/**
 * The edge of the walkable village: the border forest is solid ground for collision, but its
 * gaps (tiles the layout leaves treeless so it looks wild) would show the world beyond at eye
 * level. Boulders fill them, and become camera colliders too, so the spring arm never slips
 * through a gap either. Shown in third-person only; the diorama view has no need.
 */
export function Boundary() {
  const runtime = useRuntime();
  const assets = useAssets();
  const { layout } = runtime;

  const rocks = useMemo(() => {
    const spots: { x: number; z: number; scale: number; rotation: number }[] = [];
    for (let y = 0; y < layout.height; y += 1) {
      for (let x = 0; x < layout.width; x += 1) {
        if (layout.village.obstacles[y * layout.width + x] !== "forest") continue;
        if (hash2(x, y, 11) < TREE_GAP) continue;
        spots.push({
          x: x + 0.5 + (hash2(x, y, 41) - 0.5) * 0.3,
          z: y + 0.5 + (hash2(x, y, 42) - 0.5) * 0.3,
          scale: 1.4 + hash2(x, y, 43) * 0.9,
          rotation: hash2(x, y, 44) * Math.PI * 2,
        });
      }
    }
    const geometry = blob(0.42, 23, 0).scale(1, 0.85, 1).translate(0, 0.22, 0);
    const mesh = new THREE.InstancedMesh(
      geometry,
      assets.materials.surface("rock"),
      Math.max(1, spots.length),
    );
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    spots.forEach((spot, i) => {
      rotation.setFromAxisAngle(up, spot.rotation);
      position.set(spot.x, groundHeight(layout, spot.x, spot.z), spot.z);
      scale.setScalar(spot.scale);
      mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
    });
    mesh.count = spots.length;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    mesh.visible = false;
    return { mesh, geometry, spots };
  }, [layout, assets]);

  // The boulders join the camera's colliders (as spheres) while they exist.
  useEffect(() => {
    const spheres = runtime.views.collision.spheres;
    const added = rocks.spots.map((spot) => ({
      x: spot.x,
      y: groundHeight(layout, spot.x, spot.z) + 0.22 * spot.scale,
      z: spot.z,
      r: 0.42 * spot.scale,
    }));
    spheres.push(...added);
    return () => {
      for (const sphere of added) {
        const index = spheres.indexOf(sphere);
        if (index >= 0) spheres.splice(index, 1);
      }
      rocks.geometry.dispose();
      rocks.mesh.dispose();
    };
  }, [runtime, rocks, layout]);

  useFrame(() => {
    rocks.mesh.visible = runtime.camera.perspective;
  });

  return <primitive object={rocks.mesh} />;
}
