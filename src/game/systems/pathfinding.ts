/**
 * A* over the tile grid for tap-to-move and wandering NPCs.
 * All working memory is allocated once and reused, so searches never allocate.
 */

const SQRT2 = Math.SQRT2;
const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [0, -1, 1],
  [1, 0, 1],
  [0, 1, 1],
  [-1, 0, 1],
  [1, -1, SQRT2],
  [1, 1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

export class GridPathfinder {
  readonly width: number;
  readonly height: number;
  private readonly walkable: Uint8Array;
  private readonly g: Float32Array;
  private readonly f: Float32Array;
  private readonly parent: Int32Array;
  private readonly openStamp: Uint32Array;
  private readonly closedStamp: Uint32Array;
  private readonly heap: Int32Array;
  private readonly scratch: Int32Array;
  private heapSize = 0;
  private stamp = 0;

  constructor(width: number, height: number, walkable: Uint8Array) {
    if (walkable.length !== width * height) {
      throw new Error("Walkable grid size does not match the map size.");
    }
    this.width = width;
    this.height = height;
    this.walkable = walkable;
    const size = width * height;
    this.g = new Float32Array(size);
    this.f = new Float32Array(size);
    this.parent = new Int32Array(size);
    this.openStamp = new Uint32Array(size);
    this.closedStamp = new Uint32Array(size);
    this.heap = new Int32Array(size);
    this.scratch = new Int32Array(size);
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return false;
    }
    return this.walkable[y * this.width + x] === 1;
  }

  /**
   * Finds a path from (sx, sy) to (tx, ty). Writes tile indices (y * width + x) into `out`,
   * excluding the start and including the goal, and returns how many were written.
   * Returns 0 when no path exists or it would not fit in `out`.
   */
  findPath(sx: number, sy: number, tx: number, ty: number, out: Int32Array): number {
    if (!this.isWalkable(tx, ty) || (sx === tx && sy === ty)) {
      return 0;
    }
    this.nextStamp();
    const start = sy * this.width + sx;
    const goal = ty * this.width + tx;
    this.heapSize = 0;
    this.g[start] = 0;
    this.f[start] = this.heuristic(sx, sy, tx, ty);
    this.parent[start] = -1;
    this.push(start);

    while (this.heapSize > 0) {
      const current = this.pop();
      if (current === goal) {
        return this.reconstruct(start, goal, out);
      }
      this.closedStamp[current] = this.stamp;
      const cx = current % this.width;
      const cy = (current - cx) / this.width;

      for (let i = 0; i < NEIGHBOURS.length; i += 1) {
        const step = NEIGHBOURS[i];
        if (!step) {
          continue;
        }
        const nx = cx + step[0];
        const ny = cy + step[1];
        if (!this.isWalkable(nx, ny)) {
          continue;
        }
        // No cutting corners past walls on diagonal moves.
        if (step[0] !== 0 && step[1] !== 0) {
          if (!this.isWalkable(cx + step[0], cy) || !this.isWalkable(cx, cy + step[1])) {
            continue;
          }
        }
        const next = ny * this.width + nx;
        if (this.closedStamp[next] === this.stamp) {
          continue;
        }
        const tentative = (this.g[current] ?? 0) + step[2];
        const seen = this.openStamp[next] === this.stamp;
        if (seen && tentative >= (this.g[next] ?? 0)) {
          continue;
        }
        this.g[next] = tentative;
        this.f[next] = tentative + this.heuristic(nx, ny, tx, ty);
        this.parent[next] = current;
        if (seen) {
          this.reheap(next);
        } else {
          this.openStamp[next] = this.stamp;
          this.push(next);
        }
      }
    }
    return 0;
  }

  /** Nearest walkable tile index to (x, y) within `radius`, searching outward in rings. */
  nearestWalkable(x: number, y: number, radius: number): number {
    if (this.isWalkable(x, y)) {
      return y * this.width + x;
    }
    for (let r = 1; r <= radius; r += 1) {
      let best = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !this.isWalkable(x + dx, y + dy)) {
            continue;
          }
          const distance = dx * dx + dy * dy;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = (y + dy) * this.width + (x + dx);
          }
        }
      }
      if (best >= 0) {
        return best;
      }
    }
    return -1;
  }

  private nextStamp(): void {
    this.stamp += 1;
    if (this.stamp === 0xffffffff) {
      this.openStamp.fill(0);
      this.closedStamp.fill(0);
      this.stamp = 1;
    }
  }

  private heuristic(x: number, y: number, tx: number, ty: number): number {
    const dx = Math.abs(x - tx);
    const dy = Math.abs(y - ty);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  }

  private reconstruct(start: number, goal: number, out: Int32Array): number {
    let length = 0;
    let node = goal;
    while (node !== start && node !== -1) {
      this.scratch[length] = node;
      length += 1;
      node = this.parent[node] ?? -1;
    }
    if (length > out.length) {
      return 0;
    }
    for (let i = 0; i < length; i += 1) {
      out[i] = this.scratch[length - 1 - i] ?? 0;
    }
    return length;
  }

  // ---- binary min-heap keyed by f ----

  private score(index: number): number {
    return this.f[this.heap[index] ?? 0] ?? 0;
  }

  private swap(a: number, b: number): void {
    const tmp = this.heap[a] ?? 0;
    this.heap[a] = this.heap[b] ?? 0;
    this.heap[b] = tmp;
  }

  private push(node: number): void {
    this.heap[this.heapSize] = node;
    this.heapSize += 1;
    this.siftUp(this.heapSize - 1);
  }

  private pop(): number {
    const top = this.heap[0] ?? 0;
    this.heapSize -= 1;
    if (this.heapSize > 0) {
      this.heap[0] = this.heap[this.heapSize] ?? 0;
      this.siftDown(0);
    }
    return top;
  }

  private reheap(node: number): void {
    for (let i = 0; i < this.heapSize; i += 1) {
      if (this.heap[i] === node) {
        this.siftUp(i);
        return;
      }
    }
  }

  private siftUp(index: number): void {
    let child = index;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (this.score(child) >= this.score(parent)) {
        return;
      }
      this.swap(child, parent);
      child = parent;
    }
  }

  private siftDown(index: number): void {
    let parent = index;
    for (;;) {
      const left = parent * 2 + 1;
      const right = left + 1;
      let smallest = parent;
      if (left < this.heapSize && this.score(left) < this.score(smallest)) {
        smallest = left;
      }
      if (right < this.heapSize && this.score(right) < this.score(smallest)) {
        smallest = right;
      }
      if (smallest === parent) {
        return;
      }
      this.swap(parent, smallest);
      parent = smallest;
    }
  }
}
