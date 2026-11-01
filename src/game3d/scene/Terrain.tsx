"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { WORLD } from "@/game3d/config/visuals";
import { Kit } from "@/game3d/entities/kit";
import { useRuntime } from "@/game3d/runtime";
import { patchMaterial } from "@/game3d/shaders/patch";
import { useAssets } from "./assets";
import { buildTerrainGeometry, computeGroundOcclusion } from "./terrainGeometry";

/** The ground: textured tile tops with baked occlusion, cliffs, kerbs, banks and the bridge. */
export function Terrain() {
  const runtime = useRuntime();
  const assets = useAssets();
  const { layout } = runtime;

  const parts = useMemo(() => {
    const geometry = buildTerrainGeometry(layout);
    const resolution = 4;
    const occlusion = new THREE.DataTexture(
      computeGroundOcclusion(layout, resolution),
      layout.width * resolution,
      layout.height * resolution,
      THREE.RedFormat,
    );
    occlusion.magFilter = THREE.LinearFilter;
    occlusion.minFilter = THREE.LinearFilter;
    occlusion.channel = 1;
    occlusion.needsUpdate = true;
    const lit = (options: THREE.MeshStandardMaterialParameters) =>
      patchMaterial(
        new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, ...options }),
        runtime.uniforms,
        {
          clouds: true,
          wet: true,
        },
      );
    const materials = {
      top: lit({ map: assets.tileset, aoMap: occlusion, aoMapIntensity: 1 }),
      earth: lit({ map: assets.surfaces.earth, vertexColors: true }),
      kerb: lit({ map: assets.surfaces.kerb, vertexColors: true }),
      bank: lit({ map: assets.surfaces.bank, vertexColors: true }),
      lip: lit({ map: assets.surfaces.grassLip, side: THREE.DoubleSide }),
      bed: lit({ map: assets.surfaces.bed }),
    };
    return { geometry, materials, occlusion };
  }, [layout, assets, runtime.uniforms]);

  const bridge = useMemo(() => {
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    layout.village.ground.forEach((ground, index) => {
      if (ground !== "bridge") return;
      const x = index % layout.width;
      const z = Math.floor(index / layout.width);
      minX = Math.min(minX, x);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x + 1);
      maxZ = Math.max(maxZ, z + 1);
    });
    if (!Number.isFinite(minX)) return [];
    // Decks run between the banks; rails line the two open sides.
    const alongX = layout.village.ground[minZ * layout.width + Math.max(0, minX - 1)] !== "water";
    const kit = new Kit();
    const planks = assets.materials.surface("planks");
    const trim = assets.materials.surface("darkPlanks");
    const deck = WORLD.bridgeDeck;
    const length = (alongX ? maxX - minX : maxZ - minZ) + 0.5;
    const width = alongX ? maxZ - minZ : maxX - minX;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    kit.box("bridge", planks, alongX ? length : width, 0.14, alongX ? width : length, {
      x: cx,
      y: deck - 0.07,
      z: cz,
    });
    for (const side of [-1, 1]) {
      const offset = side * (width / 2 - 0.06);
      const rail = alongX ? { x: cx, z: cz + offset } : { x: cx + offset, z: cz };
      kit.box("bridge", trim, alongX ? length : 0.1, 0.08, alongX ? 0.1 : length, {
        ...rail,
        y: deck + 0.62,
      });
      for (let i = 0; i <= 4; i += 1) {
        const along = -length / 2 + 0.1 + (i * (length - 0.2)) / 4;
        kit.box("bridge", trim, 0.12, 0.7, 0.12, {
          x: alongX ? cx + along : cx + offset,
          y: deck + 0.3,
          z: alongX ? cz + offset : cz + along,
        });
      }
    }
    for (const along of [-length / 4, length / 4]) {
      kit.box("bridge", trim, alongX ? 0.2 : width, 0.6, alongX ? width : 0.2, {
        x: alongX ? cx + along : cx,
        y: deck - 0.45,
        z: alongX ? cz : cz + along,
      });
    }
    return kit.build();
  }, [layout, assets]);

  useEffect(
    () => () => {
      Object.values(parts.geometry).forEach((geometry) => geometry.dispose());
      Object.values(parts.materials).forEach((material) => material.dispose());
      parts.occlusion.dispose();
    },
    [parts],
  );
  useEffect(() => () => bridge.forEach((mesh) => mesh.geometry.dispose()), [bridge]);

  // Tapping the ground walks there (a drag or pinch is not a tap).
  const onGroundTap = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 8) return;
    event.stopPropagation();
    runtime.input.queueTap({
      tileX: Math.floor(event.point.x),
      tileZ: Math.floor(event.point.z),
      buildingIndex: -1,
    });
  };

  const { geometry, materials } = parts;
  return (
    <group>
      <mesh geometry={geometry.top} material={materials.top} receiveShadow onClick={onGroundTap} />
      <mesh geometry={geometry.earth} material={materials.earth} receiveShadow castShadow />
      <mesh
        geometry={geometry.kerb}
        material={materials.kerb}
        receiveShadow
        castShadow
        onClick={onGroundTap}
      />
      <mesh geometry={geometry.bank} material={materials.bank} receiveShadow />
      <mesh geometry={geometry.lip} material={materials.lip} receiveShadow />
      <mesh geometry={geometry.bed} material={materials.bed} receiveShadow />
      {bridge.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} castShadow receiveShadow />
      ))}
    </group>
  );
}
