"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hash2 } from "@/game/art/pixels";
import { PALETTE, type PaletteName } from "@/game/palette";
import type { TreeVariant } from "@/game/map/village";
import { WORLD } from "@/game3d/config/visuals";
import { useRuntime } from "@/game3d/runtime";
import { useAssets } from "@/game3d/scene/assets";
import { patchMaterial } from "@/game3d/shaders/patch";
import { pixelCanvas, pixelTexture } from "@/game3d/textures/canvas";
import type { SurfaceName } from "@/game3d/textures/surfaces";
import { groundHeight, type Placement } from "@/game3d/world/layout";
import { Kit, blob, texturedCylinder } from "./kit";

/** Height of the lamp heads (light sources and volumetric cones hang from here). */
export const LAMP_HEAD = 1.95;

interface TreeShape {
  trunk: SurfaceName;
  canopy: SurfaceName;
  build: () => { trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry };
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const result = mergeGeometries(
    parts.map((part) => (part.index ? part.toNonIndexed() : part)),
    false,
  );
  parts.forEach((part) => part.dispose());
  if (!result) throw new Error("Could not merge prop geometry.");
  return result;
}

const TREES: Record<TreeVariant, TreeShape> = {
  oak: {
    trunk: "bark",
    canopy: "leaves",
    build: () => ({
      trunk: texturedCylinder(0.1, 0.15, 1.35, 6).translate(0, 0.67, 0),
      canopy: merged([
        blob(0.78, 1).translate(0, 1.8, 0),
        blob(0.6, 2).translate(0.38, 1.5, 0.2),
        blob(0.55, 3).translate(-0.32, 1.55, -0.18),
      ]),
    }),
  },
  pine: {
    trunk: "bark",
    canopy: "needles",
    build: () => ({
      trunk: texturedCylinder(0.07, 0.1, 0.9, 6).translate(0, 0.45, 0),
      canopy: merged([
        texturedCylinder(0, 0.74, 1.05, 7).translate(0, 1.05, 0),
        texturedCylinder(0, 0.58, 0.92, 7).translate(0, 1.6, 0),
        texturedCylinder(0, 0.4, 0.8, 7).translate(0, 2.1, 0),
      ]),
    }),
  },
  birch: {
    trunk: "birchBark",
    canopy: "birchLeaves",
    build: () => ({
      trunk: texturedCylinder(0.07, 0.09, 1.9, 6).translate(0, 0.95, 0),
      canopy: merged([
        blob(0.5, 4).translate(0, 2.05, 0),
        blob(0.46, 5).translate(0.14, 1.65, 0.1),
        blob(0.4, 6).translate(-0.1, 2.4, -0.06),
      ]),
    }),
  },
};

/** A tuft of pixel grass (or flowers) on a transparent 8x8 canvas. */
function tuftTexture(flowers: boolean): THREE.CanvasTexture {
  const { canvas, ctx } = pixelCanvas(8, 8);
  const blade = (x: number, height: number, color: PaletteName) => {
    ctx.fillStyle = PALETTE[color];
    ctx.fillRect(x, 8 - height, 1, height);
  };
  for (let x = 0; x < 8; x += 1) {
    if (hash2(x, flowers ? 1 : 2, 31) < 0.3) continue;
    const height = 3 + Math.floor(hash2(x, 3, 32) * 5);
    blade(x, height, x % 3 === 0 ? "leaf" : x % 3 === 1 ? "grass" : "lime");
  }
  if (flowers) {
    const petals: readonly PaletteName[] = ["ember", "gold", "cloud", "violet", "rose"];
    for (let i = 0; i < 3; i += 1) {
      const x = 1 + Math.floor(hash2(i, 4, 33) * 6);
      const y = 1 + Math.floor(hash2(i, 5, 34) * 3);
      ctx.fillStyle = PALETTE[petals[i % petals.length] ?? "gold"];
      ctx.fillRect(x, y, 2, 2);
    }
  }
  return pixelTexture(canvas);
}

function crossedQuads(width: number, height: number): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(width, height).translate(0, height / 2, 0);
  const b = a.clone().rotateY(Math.PI / 2);
  const geometry = merged([a, b]);
  // Lit like the ground under them, whichever way the camera turns.
  const normal = geometry.getAttribute("normal");
  for (let i = 0; i < normal.count; i += 1) normal.setXYZ(i, 0, 1, 0);
  return geometry;
}

function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: readonly Placement[],
  height: (placement: Placement) => number,
  shadows: boolean,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, placements.length));
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  placements.forEach((placement, i) => {
    position.set(placement.x, height(placement), placement.z);
    rotation.setFromAxisAngle(up, placement.rotation);
    scale.setScalar(placement.scale);
    mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
  });
  mesh.count = placements.length;
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Trees, bushes, rocks, grass, lamps, stalls, benches, the well, fences and the fountain. */
export function Props() {
  const runtime = useRuntime();
  const assets = useAssets();
  const { layout } = runtime;

  const scene = useMemo(() => {
    const m = assets.materials;
    const objects: THREE.Object3D[] = [];
    const disposables: { dispose: () => void }[] = [];
    const ground = (placement: { x: number; z: number }) =>
      groundHeight(layout, placement.x, placement.z);

    // Trees: one instanced trunk and canopy per variant.
    for (const variant of ["oak", "pine", "birch"] as const) {
      const shape = TREES[variant];
      const placements = layout.trees.filter((tree) => tree.variant === variant);
      if (placements.length === 0) continue;
      const geometry = shape.build();
      const forestHeight = (placement: Placement) =>
        layout.heights[Math.floor(placement.z) * layout.width + Math.floor(placement.x)] ?? 0;
      objects.push(
        instanced(geometry.trunk, m.surface(shape.trunk), placements, forestHeight, true),
      );
      objects.push(
        instanced(geometry.canopy, m.surface(shape.canopy), placements, forestHeight, true),
      );
      disposables.push(geometry.trunk, geometry.canopy);
    }

    const bushGeometry = blob(0.44, 9).scale(1, 0.8, 1).translate(0, 0.3, 0);
    objects.push(instanced(bushGeometry, m.surface("bush"), layout.bushes, ground, true));
    const rockGeometry = blob(0.42, 10, 0).scale(1, 0.7, 1).translate(0, 0.18, 0);
    objects.push(instanced(rockGeometry, m.surface("rock"), layout.rocks, ground, true));
    disposables.push(bushGeometry, rockGeometry);

    // Grass tufts and flowers, swaying in the wind (no shadows: cheap and soft).
    const tufts: Placement[] = [];
    const flowers: Placement[] = [];
    const blocked = new Set<number>();
    for (const building of layout.buildings) {
      const { rect } = building;
      for (let z = rect.y - 1; z <= rect.y + rect.height; z += 1) {
        for (let x = rect.x - 1; x <= rect.x + rect.width; x += 1)
          blocked.add(z * layout.width + x);
      }
    }
    layout.village.ground.forEach((kind, index) => {
      if (layout.village.obstacles[index] || blocked.has(index)) return;
      const x = index % layout.width;
      const z = Math.floor(index / layout.width);
      const count = kind === "flowers" ? 3 : kind === "grass" && hash2(x, z, 40) < 0.45 ? 2 : 0;
      for (let i = 0; i < count; i += 1) {
        const placement = {
          x: x + 0.15 + hash2(x, z, 41 + i) * 0.7,
          z: z + 0.15 + hash2(x, z, 51 + i) * 0.7,
          rotation: hash2(x, z, 61 + i) * Math.PI,
          scale: 0.8 + hash2(x, z, 71 + i) * 0.5,
        };
        (kind === "flowers" ? flowers : tufts).push(placement);
      }
    });
    const tuftGeometry = crossedQuads(0.42, 0.42);
    disposables.push(tuftGeometry);
    for (const [list, isFlower] of [
      [tufts, false],
      [flowers, true],
    ] as const) {
      const texture = tuftTexture(isFlower);
      const material = patchMaterial(
        new THREE.MeshStandardMaterial({
          map: texture,
          alphaTest: 0.5,
          side: THREE.DoubleSide,
          roughness: 1,
        }),
        runtime.uniforms,
        { wind: "grass", clouds: true },
      );
      disposables.push(texture, material);
      objects.push(instanced(tuftGeometry, material, list, ground, false));
    }

    // Everything else is merged per material into a handful of static meshes.
    const kit = new Kit();
    const box = (
      surface: SurfaceName | THREE.Material,
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      rotY = 0,
    ) =>
      kit.box("props", typeof surface === "string" ? m.surface(surface) : surface, w, h, d, {
        x,
        y: y + h / 2,
        z,
        rotY,
      });
    for (const lamp of layout.lamps) {
      const y = ground(lamp);
      box("kerb", 0.26, 0.14, 0.26, lamp.x, y, lamp.z);
      kit.cylinder(
        "props",
        m.surface("iron"),
        0.05,
        LAMP_HEAD - 0.1,
        { x: lamp.x, y: y + (LAMP_HEAD - 0.1) / 2, z: lamp.z },
        6,
      );
      box(m.emissive("lamp"), 0.22, 0.26, 0.22, lamp.x, y + LAMP_HEAD - 0.12, lamp.z);
      box("iron", 0.34, 0.06, 0.34, lamp.x, y + LAMP_HEAD + 0.14, lamp.z);
      box("iron", 0.12, 0.08, 0.12, lamp.x, y + LAMP_HEAD + 0.2, lamp.z);
    }
    layout.stalls.forEach((stall, index) => {
      const y = ground(stall);
      const cloth: SurfaceName = index % 2 === 0 ? "clothRed" : "clothViolet";
      box("planks", 1.7, 0.72, 0.7, stall.x, y, stall.z);
      box("fruit", 1.5, 0.1, 0.55, stall.x, y + 0.72, stall.z);
      for (const [dx, dz] of [
        [-0.82, -0.32],
        [0.82, -0.32],
        [-0.82, 0.32],
        [0.82, 0.32],
      ] as const) {
        box("darkPlanks", 0.08, 1.62, 0.08, stall.x + dx, y, stall.z + dz);
      }
      kit.add(
        "props",
        m.surface(cloth),
        new THREE.BoxGeometry(1.95, 0.05, 1.05).rotateX(0.22).toNonIndexed(),
        { x: stall.x, y: y + 1.68, z: stall.z + 0.02 },
      );
      box("planks", 0.5, 0.35, 0.4, stall.x + 0.55, y, stall.z + 0.55);
    });
    for (const bench of layout.benches) {
      const y = ground(bench);
      box("planks", 0.86, 0.07, 0.32, bench.x, y + 0.34, bench.z);
      box("planks", 0.86, 0.26, 0.06, bench.x, y + 0.44, bench.z - 0.15);
      for (const dx of [-0.36, 0.36]) box("darkPlanks", 0.06, 0.34, 0.28, bench.x + dx, y, bench.z);
    }
    for (const well of layout.wells) {
      const y = ground(well);
      kit.add("props", m.surface("stone"), texturedCylinder(0.44, 0.46, 0.55, 10, true), {
        x: well.x,
        y: y + 0.275,
        z: well.z,
      });
      kit.add(
        "props",
        m.surface("stone"),
        texturedCylinder(0.34, 0.34, 0.55, 10, true).scale(-1, 1, 1),
        { x: well.x, y: y + 0.275, z: well.z },
      );
      box("iron", 0.66, 0.02, 0.66, well.x, y + 0.3, well.z);
      for (const dx of [-0.42, 0.42]) box("darkPlanks", 0.08, 1.35, 0.08, well.x + dx, y, well.z);
      box("darkPlanks", 0.94, 0.07, 0.07, well.x, y + 1.15, well.z);
      kit.add(
        "props",
        m.surface("roofShingle"),
        new THREE.ConeGeometry(0.72, 0.42, 4).rotateY(Math.PI / 4).toNonIndexed(),
        { x: well.x, y: y + 1.55, z: well.z },
      );
      box("planks", 0.16, 0.16, 0.16, well.x + 0.1, y + 0.85, well.z);
    }
    for (const planter of layout.planters) {
      const y = ground(planter);
      box("planks", 0.82, 0.36, 0.82, planter.x, y, planter.z);
      kit.add("props", m.surface("bush"), blob(0.36, planter.x + planter.z).scale(1, 0.6, 1), {
        x: planter.x,
        y: y + 0.42,
        z: planter.z,
      });
    }
    for (const entry of layout.decor) {
      const y = ground(entry);
      if (entry.kind === "barrel") {
        kit.add("props", m.surface("planks"), texturedCylinder(0.28, 0.25, 0.68, 10), {
          x: entry.x,
          y: y + 0.34,
          z: entry.z,
        });
        for (const by of [0.14, 0.54]) {
          kit.add("props", m.surface("iron"), texturedCylinder(0.29, 0.29, 0.04, 10), {
            x: entry.x,
            y: y + by,
            z: entry.z,
          });
        }
      } else {
        box("planks", 0.56, 0.56, 0.56, entry.x, y, entry.z, entry.rotation * 0.2);
        box("darkPlanks", 0.6, 0.06, 0.6, entry.x, y + 0.28, entry.z, entry.rotation * 0.2);
      }
    }
    for (const fence of layout.fences) {
      const y = ground(fence);
      box("darkPlanks", 0.12, 0.7, 0.12, fence.x, y, fence.z);
      if (fence.east) {
        for (const ry of [0.32, 0.56]) box("planks", 1, 0.07, 0.05, fence.x + 0.5, y + ry, fence.z);
      }
      if (fence.south) {
        for (const ry of [0.32, 0.56]) box("planks", 0.05, 0.07, 1, fence.x, y + ry, fence.z + 0.5);
      }
    }
    const fountain = layout.fountain;
    if (fountain) {
      const y = WORLD.plazaHeight;
      const r = fountain.radius * 0.92;
      kit.add("props", m.surface("kerb"), texturedCylinder(r, r + 0.04, 0.42, 18, true), {
        x: fountain.x,
        y: y + 0.21,
        z: fountain.z,
      });
      kit.add(
        "props",
        m.surface("kerb"),
        texturedCylinder(r - 0.14, r - 0.14, 0.42, 18, true).scale(-1, 1, 1),
        { x: fountain.x, y: y + 0.21, z: fountain.z },
      );
      kit.add(
        "props",
        m.surface("kerb"),
        new THREE.RingGeometry(r - 0.14, r, 18).rotateX(-Math.PI / 2).toNonIndexed(),
        { x: fountain.x, y: y + 0.42, z: fountain.z },
      );
      kit.add("props", m.surface("stone"), texturedCylinder(0.13, 0.17, 1.05, 8), {
        x: fountain.x,
        y: y + 0.52,
        z: fountain.z,
      });
      kit.add("props", m.surface("kerb"), texturedCylinder(0.36, 0.28, 0.14, 12), {
        x: fountain.x,
        y: y + 1.05,
        z: fountain.z,
      });
    }
    for (const mesh of kit.build()) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      objects.push(mesh);
      disposables.push(mesh.geometry);
    }
    return { objects, disposables };
  }, [layout, assets, runtime.uniforms]);

  useEffect(() => () => scene.disposables.forEach((item) => item.dispose()), [scene]);

  return (
    <group>
      {scene.objects.map((object) => (
        <primitive key={object.uuid} object={object} />
      ))}
    </group>
  );
}
