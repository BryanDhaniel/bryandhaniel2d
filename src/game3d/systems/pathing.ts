import type { GridPathfinder } from "./pathfinding";

/**
 * Follows an A* route through tile centres (world units: tile x, z at x + 0.5, z + 0.5).
 * The path buffer is allocated once and reused for every plan.
 */
export class PathFollower {
  private readonly path: Int32Array;
  private length = 0;
  private index = 0;
  /** True for one update after the last waypoint is reached. */
  arrived = false;

  constructor(
    private readonly finder: GridPathfinder,
    capacity: number,
  ) {
    this.path = new Int32Array(capacity);
  }

  get active(): boolean {
    return this.index < this.length;
  }

  /** The final tile of the current plan as a tile index, or -1. */
  get goal(): number {
    return this.length > 0 ? (this.path[this.length - 1] ?? -1) : -1;
  }

  /** Plans a route between tiles. Returns false when the goal can't be reached. */
  plan(fromX: number, fromZ: number, toX: number, toZ: number): boolean {
    this.arrived = false;
    this.length = this.finder.findPath(fromX, fromZ, toX, toZ, this.path);
    this.index = 0;
    return this.length > 0;
  }

  cancel(): void {
    this.length = 0;
    this.index = 0;
    this.arrived = false;
  }

  /** Writes the unit direction from (x, z) toward the next waypoint. False once done. */
  steer(x: number, z: number, out: { x: number; z: number }): boolean {
    this.arrived = false;
    while (this.index < this.length) {
      const tile = this.path[this.index] ?? 0;
      const tx = (tile % this.finder.width) + 0.5;
      const tz = Math.floor(tile / this.finder.width) + 0.5;
      const dx = tx - x;
      const dz = tz - z;
      const distance = Math.hypot(dx, dz);
      const last = this.index === this.length - 1;
      if (distance > (last ? 0.12 : 0.35)) {
        out.x = dx / distance;
        out.z = dz / distance;
        return true;
      }
      this.index += 1;
      if (this.index >= this.length) {
        this.arrived = true;
      }
    }
    out.x = 0;
    out.z = 0;
    return false;
  }
}
