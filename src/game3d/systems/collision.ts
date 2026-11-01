/**
 * Circle-versus-world collision on the tile grid, without a physics engine. Whole tiles can be
 * solid (water, forest, building footprints); smaller obstacles (tree trunks, lamp posts,
 * stalls) are circles and boxes bucketed per tile. Movement is split into short sub-steps
 * and resolved one axis at a time, so fast frames can't tunnel through thin posts.
 */

export interface Circle {
  x: number;
  z: number;
  r: number;
}

export interface Box {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface Point2 {
  x: number;
  z: number;
}

const MAX_STEP = 0.2;

export class CollisionWorld {
  private readonly circleBuckets: number[][];
  private readonly boxBuckets: number[][];

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly solid: Uint8Array,
    private readonly circles: readonly Circle[],
    private readonly boxes: readonly Box[],
  ) {
    if (solid.length !== width * height) {
      throw new Error("Solid grid size does not match the map size.");
    }
    this.circleBuckets = Array.from({ length: width * height }, () => []);
    this.boxBuckets = Array.from({ length: width * height }, () => []);
    circles.forEach((circle, index) =>
      this.bucket(
        this.circleBuckets,
        index,
        circle.x - circle.r,
        circle.z - circle.r,
        circle.x + circle.r,
        circle.z + circle.r,
      ),
    );
    boxes.forEach((box, index) =>
      this.bucket(this.boxBuckets, index, box.minX, box.minZ, box.maxX, box.maxZ),
    );
  }

  isSolidTile(tx: number, tz: number): boolean {
    if (tx < 0 || tz < 0 || tx >= this.width || tz >= this.height) {
      return true;
    }
    return this.solid[tz * this.width + tx] === 1;
  }

  /** True when a circle of `radius` at (x, z) overlaps nothing. */
  isFree(x: number, z: number, radius: number): boolean {
    const probe = { x, z };
    return !this.resolve(probe, radius);
  }

  /** Moves `position` by (dx, dz), sliding along anything in the way. */
  move(position: Point2, dx: number, dz: number, radius: number): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / MAX_STEP));
    const sx = dx / steps;
    const sz = dz / steps;
    for (let i = 0; i < steps; i += 1) {
      position.x += sx;
      this.resolve(position, radius);
      position.z += sz;
      this.resolve(position, radius);
    }
  }

  /** Pushes the circle out of everything it overlaps. Returns true if it overlapped anything. */
  private resolve(position: Point2, radius: number): boolean {
    let hit = false;
    for (let pass = 0; pass < 2; pass += 1) {
      const x0 = Math.floor(position.x - radius);
      const x1 = Math.floor(position.x + radius);
      const z0 = Math.floor(position.z - radius);
      const z1 = Math.floor(position.z + radius);
      let moved = false;
      for (let tz = z0; tz <= z1; tz += 1) {
        for (let tx = x0; tx <= x1; tx += 1) {
          if (this.isSolidTile(tx, tz)) {
            moved = pushOutOfBox(position, radius, tx, tz, tx + 1, tz + 1) || moved;
            continue;
          }
          const index = tz * this.width + tx;
          for (const id of this.circleBuckets[index] ?? []) {
            const circle = this.circles[id];
            if (circle) moved = pushOutOfCircle(position, radius, circle) || moved;
          }
          for (const id of this.boxBuckets[index] ?? []) {
            const box = this.boxes[id];
            if (box) {
              moved =
                pushOutOfBox(position, radius, box.minX, box.minZ, box.maxX, box.maxZ) || moved;
            }
          }
        }
      }
      hit = hit || moved;
      if (!moved) break;
    }
    return hit;
  }

  private bucket(
    buckets: number[][],
    index: number,
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
  ): void {
    for (let tz = Math.floor(minZ); tz <= Math.floor(maxZ); tz += 1) {
      for (let tx = Math.floor(minX); tx <= Math.floor(maxX); tx += 1) {
        if (tx < 0 || tz < 0 || tx >= this.width || tz >= this.height) continue;
        buckets[tz * this.width + tx]?.push(index);
      }
    }
  }
}

function pushOutOfCircle(position: Point2, radius: number, circle: Circle): boolean {
  const dx = position.x - circle.x;
  const dz = position.z - circle.z;
  const min = radius + circle.r;
  const distanceSq = dx * dx + dz * dz;
  if (distanceSq >= min * min) {
    return false;
  }
  const distance = Math.sqrt(distanceSq);
  if (distance < 1e-6) {
    position.x = circle.x + min;
    return true;
  }
  const push = (min - distance) / distance;
  position.x += dx * push;
  position.z += dz * push;
  return true;
}

function pushOutOfBox(
  position: Point2,
  radius: number,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): boolean {
  const cx = Math.min(Math.max(position.x, minX), maxX);
  const cz = Math.min(Math.max(position.z, minZ), maxZ);
  const dx = position.x - cx;
  const dz = position.z - cz;
  const distanceSq = dx * dx + dz * dz;
  if (distanceSq >= radius * radius) {
    return false;
  }
  if (distanceSq > 1e-12) {
    const distance = Math.sqrt(distanceSq);
    const push = (radius - distance) / distance;
    position.x += dx * push;
    position.z += dz * push;
    return true;
  }
  // The centre is inside the box: leave through the nearest side.
  const left = position.x - minX;
  const right = maxX - position.x;
  const top = position.z - minZ;
  const bottom = maxZ - position.z;
  const nearest = Math.min(left, right, top, bottom);
  if (nearest === left) position.x = minX - radius;
  else if (nearest === right) position.x = maxX + radius;
  else if (nearest === top) position.z = minZ - radius;
  else position.z = maxZ + radius;
  return true;
}
