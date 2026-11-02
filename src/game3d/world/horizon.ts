import { hash2 } from "@/game/art/pixels";
import { HORIZON, WORLD } from "@/game3d/config/visuals";

/**
 * The land around the village, as pure functions so the horizon mesh, the camera's terrain
 * collision and the tests agree: a forested shelf at the height of the village's tree border,
 * rolling hills that rise to a ring of cliffs further out, and a lake basin. Coordinates are
 * world units; the village map covers [0, width] × [0, height].
 */

/** Smooth value noise in [0, 1] (bilinear blend of hashed lattice values). */
export function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Distance from (x, z) to the map rectangle; 0 inside it. */
export function distanceOutside(x: number, z: number, width: number, height: number): number {
  const dx = x < 0 ? -x : x > width ? x - width : 0;
  const dz = z < 0 ? -z : z > height ? z - height : 0;
  return Math.hypot(dx, dz);
}

/** Depth of the lake basin at (x, z): 0 outside it, up to 1 at its centre. */
export function lakeDepth(x: number, z: number): number {
  const { x: lx, z: lz, radiusX, radiusZ } = HORIZON.lake;
  const nx = (x - lx) / radiusX;
  const nz = (z - lz) / radiusZ;
  // A wobbly shoreline so it reads as a natural lake, not an ellipse.
  const wobble = 0.12 * (valueNoise(x * 0.18, z * 0.18, 91) - 0.5);
  return 1 - smoothstep(0.55, 1 + wobble, Math.hypot(nx, nz));
}

/**
 * Ground height outside the village: the shelf (the border forest's height) for the first few
 * units, then hills, then the cliff ring; the lake basin cuts below the water.
 */
export function outerHeight(x: number, z: number, width: number, height: number): number {
  const d = distanceOutside(x, z, width, height);
  const shelf = WORLD.forestHeight;
  const rolling =
    smoothstep(HORIZON.shelf, HORIZON.shelf + 14, d) *
    (HORIZON.hillHeight * (0.45 + 0.75 * valueNoise(x * 0.06, z * 0.06, 61)) +
      0.6 * valueNoise(x * 0.21, z * 0.21, 62));
  const cliff =
    smoothstep(HORIZON.cliffStart, HORIZON.cliffStart + 3, d) *
    (HORIZON.cliffHeight * (0.7 + 0.5 * valueNoise(x * 0.09, z * 0.09, 63)));
  const lake = lakeDepth(x, z);
  const land = shelf + rolling + cliff;
  return land + (WORLD.waterBed - 0.4 - land) * lake;
}
