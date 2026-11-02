import * as THREE from "three";
import { hash2 } from "@/game/art/pixels";
import { PALETTE, type PaletteName } from "@/game/palette";
import { HORIZON, WORLD } from "@/game3d/config/visuals";
import { distanceOutside, lakeDepth, outerHeight, valueNoise } from "@/game3d/world/horizon";

/**
 * Geometry for the land around the village (pure three.js, no React): a flat-shaded grid of
 * hills and cliffs, positions for the outer tree line, and two bands of distant mountains.
 * Heights come from world/horizon.ts, so the camera's terrain collision matches what you see.
 */

const color = (name: PaletteName) => new THREE.Color(PALETTE[name]);
const GRASS = color("grass");
const FOREST = color("forest");
const MOSS = color("moss");
const ROCK = color("stone");
const DARK_ROCK = color("slate");
const SAND = color("wheat");
const SNOW = color("cloud");

/** The land ring: grid cells outside the map, coloured by height, slope and the lake shore. */
export function buildLandGeometry(width: number, height: number): THREE.BufferGeometry {
  const { extent, step } = HORIZON;
  const positions: number[] = [];
  const colors: number[] = [];
  const mixed = new THREE.Color();
  const corner = (x: number, z: number) => [x, outerHeight(x, z, width, height), z] as const;
  for (let z = -extent; z < height + extent; z += step) {
    for (let x = -extent; x < width + extent; x += step) {
      // The village's own terrain covers the map.
      if (x >= 0 && z >= 0 && x + step <= width && z + step <= height) continue;
      const a = corner(x, z);
      const b = corner(x + step, z);
      const c = corner(x, z + step);
      const d = corner(x + step, z + step);
      for (const tri of [
        [a, c, d],
        [a, d, b],
      ] as const) {
        const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
        const cz = (tri[0][2] + tri[1][2] + tri[2][2]) / 3;
        const top = Math.max(tri[0][1], tri[1][1], tri[2][1]);
        const low = Math.min(tri[0][1], tri[1][1], tri[2][1]);
        const slope = (top - low) / step;
        const out = distanceOutside(cx, cz, width, height);
        const shore = lakeDepth(cx, cz);
        if (shore > 0.02 && low < WORLD.waterLevel + 0.6) mixed.copy(SAND);
        else if (slope > 0.9 || top > WORLD.forestHeight + HORIZON.hillHeight + 4) {
          mixed.copy(slope > 1.6 ? DARK_ROCK : ROCK);
          if (top > WORLD.forestHeight + HORIZON.cliffHeight + 2) mixed.lerp(SNOW, 0.5);
        } else if (out < HORIZON.treeDepth)
          mixed.copy(FOREST).lerp(MOSS, valueNoise(cx * 0.2, cz * 0.2, 71) * 0.6);
        else mixed.copy(GRASS).lerp(FOREST, 0.4 + valueNoise(cx * 0.1, cz * 0.1, 72) * 0.4);
        for (const [px, py, pz] of tri) {
          positions.push(px, py, pz);
          colors.push(mixed.r, mixed.g, mixed.b);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export interface OuterTree {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  pine: boolean;
}

/** Trees scattered over the forested shelf and lower hills (never in the lake or on cliffs). */
export function outerTrees(width: number, height: number): OuterTree[] {
  const trees: OuterTree[] = [];
  const reach = HORIZON.treeDepth;
  for (let i = 0; trees.length < HORIZON.trees && i < HORIZON.trees * 8; i += 1) {
    const x = -reach + hash2(i, 1, 81) * (width + 2 * reach);
    const z = -reach + hash2(i, 2, 82) * (height + 2 * reach);
    const out = distanceOutside(x, z, width, height);
    if (out < 0.6 || out > reach) continue;
    if (lakeDepth(x, z) > 0.01) continue;
    const y = outerHeight(x, z, width, height);
    const slope = Math.abs(outerHeight(x + 0.5, z, width, height) - y) * 2;
    if (slope > 0.8) continue;
    trees.push({
      x,
      y,
      z,
      scale: 0.85 + hash2(i, 3, 83) * 0.7,
      rotation: hash2(i, 4, 84) * Math.PI * 2,
      pine: hash2(i, 5, 85) < 0.62,
    });
  }
  return trees;
}

/** A ring of low-poly peaks, coloured rock to snow by height (vertex colours). */
export function buildMountains(centreX: number, centreZ: number): THREE.BufferGeometry {
  const { radius, peaks, height } = HORIZON.mountains;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < peaks; i += 1) {
    const angle = (i / peaks) * Math.PI * 2 + hash2(i, 1, 91) * 0.18;
    const h = height[0] + hash2(i, 2, 92) * (height[1] - height[0]);
    const r = h * (0.9 + hash2(i, 3, 93) * 0.6);
    const distance = radius + (hash2(i, 4, 94) - 0.5) * 30;
    const cone = new THREE.ConeGeometry(
      r,
      h,
      5 + Math.floor(hash2(i, 5, 95) * 3),
      1,
    ).toNonIndexed();
    cone.rotateY(hash2(i, 6, 96) * Math.PI);
    cone.translate(
      centreX + Math.cos(angle) * distance,
      h / 2 - 4,
      centreZ + Math.sin(angle) * distance,
    );
    const position = cone.getAttribute("position");
    const colors: number[] = [];
    const tint = new THREE.Color();
    for (let v = 0; v < position.count; v += 1) {
      const y = position.getY(v) + 4;
      tint.copy(DARK_ROCK).lerp(ROCK, Math.min(1, y / h));
      if (y > h * 0.72) tint.lerp(SNOW, 0.85);
      colors.push(tint.r, tint.g, tint.b);
    }
    cone.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    parts.push(cone);
  }
  const merged = mergeNonIndexed(parts);
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

/** The farthest silhouette: a band with a jagged top, a hazy wall behind everything. */
export function buildBackdrop(centreX: number, centreZ: number): THREE.BufferGeometry {
  const { radius, height } = HORIZON.backdrop;
  const segments = 120;
  const positions: number[] = [];
  const colors: number[] = [];
  const low = color("deep");
  const high = color("slate");
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const t0 = height * (0.35 + 0.65 * valueNoise(i * 0.35, 0, 97));
    const t1 = height * (0.35 + 0.65 * valueNoise((i + 1) * 0.35, 0, 97));
    const x0 = centreX + Math.cos(a0) * radius;
    const z0 = centreZ + Math.sin(a0) * radius;
    const x1 = centreX + Math.cos(a1) * radius;
    const z1 = centreZ + Math.sin(a1) * radius;
    const quad = [
      [x0, -6, z0, low],
      [x0, t0, z0, high],
      [x1, t1, z1, high],
      [x0, -6, z0, low],
      [x1, t1, z1, high],
      [x1, -6, z1, low],
    ] as const;
    for (const [x, y, z, tone] of quad) {
      positions.push(x, y, z);
      colors.push(tone.r, tone.g, tone.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function mergeNonIndexed(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  for (const part of parts) {
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
  return geometry;
}
