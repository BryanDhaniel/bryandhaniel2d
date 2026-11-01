import { TILE_SIZE } from "@/game/map/village";
import type { GridPathfinder } from "./pathfinding";

/** Steering target written into a caller-owned object to avoid allocations. */
export interface Steer {
  x: number;
  y: number;
}

const ARRIVE_DISTANCE = 1.5;

/**
 * Walks a tile path produced by GridPathfinder. The path buffer is allocated once per
 * follower; `steer()` writes a direction (not normalised) toward the next tile centre.
 */
export class PathFollower {
  private readonly path: Int32Array;
  private length = 0;
  private index = 0;
  /** Set for one update after the last waypoint is reached. */
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

  /** Plans a route between tiles. Returns false when the goal can't be reached. */
  plan(fromX: number, fromY: number, toX: number, toY: number): boolean {
    this.arrived = false;
    this.length = this.finder.findPath(fromX, fromY, toX, toY, this.path);
    this.index = 0;
    return this.length > 0;
  }

  /** The final tile of the current plan, as a tile index, or -1. */
  get goal(): number {
    return this.length > 0 ? (this.path[this.length - 1] ?? -1) : -1;
  }

  cancel(): void {
    this.length = 0;
    this.index = 0;
    this.arrived = false;
  }

  /** Writes the direction from (x, y) toward the next waypoint. Returns false when done. */
  steer(x: number, y: number, out: Steer): boolean {
    this.arrived = false;
    while (this.index < this.length) {
      const tile = this.path[this.index] ?? 0;
      const tx = (tile % this.finder.width) * TILE_SIZE + TILE_SIZE / 2;
      const ty = Math.floor(tile / this.finder.width) * TILE_SIZE + TILE_SIZE / 2;
      const dx = tx - x;
      const dy = ty - y;
      if (Math.abs(dx) <= ARRIVE_DISTANCE && Math.abs(dy) <= ARRIVE_DISTANCE) {
        this.index += 1;
        if (this.index >= this.length) {
          this.arrived = true;
          this.length = 0;
          this.index = 0;
          out.x = 0;
          out.y = 0;
          return false;
        }
        continue;
      }
      out.x = dx;
      out.y = dy;
      return true;
    }
    out.x = 0;
    out.y = 0;
    return false;
  }
}
