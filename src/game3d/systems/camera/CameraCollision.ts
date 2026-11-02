import type { TreeVariant } from "@/game/map/village";
import type { WorldLayout } from "@/game3d/world/layout";

/**
 * Spring-arm collision for the third-person camera: a sphere swept from the head pivot toward
 * the wanted camera position against simple stand-ins for the world (one box per building,
 * stall and the mailbox, a sphere per tree canopy, and the terrain height field). Analytic
 * tests on plain numbers, so a cast allocates nothing and costs a few microseconds.
 */

export interface ColliderBox {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface ColliderSphere {
  x: number;
  y: number;
  z: number;
  r: number;
}

/** Canopy stand-ins per tree variant (height of the centre and radius, at scale 1). */
const TREE_CANOPIES: Record<TreeVariant, { y: number; r: number }> = {
  oak: { y: 1.7, r: 0.85 },
  pine: { y: 1.55, r: 0.72 },
  birch: { y: 2.0, r: 0.55 },
};

/** Height of the ground (or the hills outside the village) at a world position. */
export type HeightField = (x: number, z: number) => number;

/** Step along the ray when probing the terrain (world units). */
const TERRAIN_STEP = 0.2;

export class CameraCollision {
  readonly boxes: ColliderBox[] = [];
  readonly spheres: ColliderSphere[] = [];
  private buildingCount = 0;

  constructor(
    layout: WorldLayout,
    readonly heightAt: HeightField,
  ) {
    for (const tree of layout.trees) {
      const canopy = TREE_CANOPIES[tree.variant];
      const base = heightAt(tree.x, tree.z);
      this.spheres.push({
        x: tree.x,
        y: base + canopy.y * tree.scale,
        z: tree.z,
        r: canopy.r * tree.scale,
      });
    }
    for (const stall of layout.stalls) {
      const base = heightAt(stall.x, stall.z);
      this.boxes.push({
        minX: stall.x - 1,
        minY: base,
        minZ: stall.z - 0.45,
        maxX: stall.x + 1,
        maxY: base + 1.7,
        maxZ: stall.z + 0.45,
      });
    }
  }

  /** Replaces the building boxes (the buildings register theirs when they are built). */
  setBuildings(boxes: readonly ColliderBox[]): void {
    this.boxes.splice(this.boxes.length - this.buildingCount, this.buildingCount, ...boxes);
    this.buildingCount = boxes.length;
  }

  /**
   * Distance along the unit direction (dx, dy, dz) from the origin at which a sphere of
   * `radius` first touches anything, or `maxDistance` if the way is clear.
   */
  cast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDistance: number,
    radius: number,
    clearance: number,
  ): number {
    let best = maxDistance;
    for (const box of this.boxes) {
      const t = rayBox(ox, oy, oz, dx, dy, dz, box, radius);
      if (t >= 0 && t < best) best = t;
    }
    for (const sphere of this.spheres) {
      const t = raySphere(ox, oy, oz, dx, dy, dz, sphere, radius);
      if (t >= 0 && t < best) best = t;
    }
    // The terrain: walk the ray and stop where the sphere would dip below the ground.
    const floor = radius + clearance;
    for (let t = TERRAIN_STEP; t < best; t += TERRAIN_STEP) {
      const x = ox + dx * t;
      const z = oz + dz * t;
      if (oy + dy * t - floor < this.heightAt(x, z)) {
        best = Math.max(0, t - TERRAIN_STEP);
        break;
      }
    }
    return best;
  }
}

/** Clips the ray's [near, far] range against one axis slab; false when it misses. */
function clipSlab(o: number, d: number, min: number, max: number): boolean {
  if (Math.abs(d) < 1e-9) return o >= min && o <= max;
  let t0 = (min - o) / d;
  let t1 = (max - o) / d;
  if (t0 > t1) {
    const swap = t0;
    t0 = t1;
    t1 = swap;
  }
  if (t0 > RANGE.near) RANGE.near = t0;
  if (t1 < RANGE.far) RANGE.far = t1;
  return RANGE.near <= RANGE.far && RANGE.far >= 0;
}

const RANGE = { near: 0, far: 0 };

/** Entry distance of a ray into a box grown by `radius` (slab test), or -1 for a miss. */
export function rayBox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  box: ColliderBox,
  radius: number,
): number {
  RANGE.near = -Infinity;
  RANGE.far = Infinity;
  if (!clipSlab(ox, dx, box.minX - radius, box.maxX + radius)) return -1;
  if (!clipSlab(oy, dy, box.minY - radius, box.maxY + radius)) return -1;
  if (!clipSlab(oz, dz, box.minZ - radius, box.maxZ + radius)) return -1;
  // Starting inside the box (the pivot is in a doorway): ignore it rather than lock the arm at 0.
  return RANGE.near < 0 ? -1 : RANGE.near;
}

/** Entry distance of a ray into a sphere grown by `radius`, or -1 for a miss. */
export function raySphere(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  sphere: ColliderSphere,
  radius: number,
): number {
  const r = sphere.r + radius;
  const lx = ox - sphere.x;
  const ly = oy - sphere.y;
  const lz = oz - sphere.z;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  if (c < 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : -1;
}
