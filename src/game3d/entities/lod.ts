import * as THREE from "three";

/** One drawable part of a level (a trunk, a canopy). */
export interface LodPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/**
 * Three levels of detail for an instanced prop (the village's trees): every placement's matrix
 * is computed once, and `update` re-buckets placements into the near, mid and far meshes by
 * distance from the camera, copying matrices without allocating. With `update(null)` (the
 * isometric view, where everything is equally far) every placement uses the near level.
 * Bounding spheres cover every placement, so frustum culling stays correct as counts change.
 */
export class InstancedLod {
  /** levels[level][part] */
  readonly levels: THREE.InstancedMesh[][];
  private readonly matrices: Float32Array;
  private readonly positions: Float32Array;
  private readonly counts = new Int32Array(3);
  private allNear = false;

  constructor(
    levels: readonly (readonly LodPart[])[],
    placements: readonly THREE.Matrix4[],
    shadows: readonly boolean[],
  ) {
    const count = placements.length;
    this.matrices = new Float32Array(count * 16);
    this.positions = new Float32Array(count * 3);
    placements.forEach((matrix, i) => {
      this.matrices.set(matrix.elements, i * 16);
      this.positions[i * 3] = matrix.elements[12] ?? 0;
      this.positions[i * 3 + 1] = matrix.elements[13] ?? 0;
      this.positions[i * 3 + 2] = matrix.elements[14] ?? 0;
    });
    this.levels = levels.map((parts, level) =>
      parts.map((part) => {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, Math.max(1, count));
        (mesh.instanceMatrix.array as Float32Array).set(this.matrices);
        mesh.count = count;
        mesh.computeBoundingSphere();
        mesh.count = level === 0 ? count : 0;
        mesh.castShadow = shadows[level] ?? false;
        mesh.receiveShadow = true;
        return mesh;
      }),
    );
    this.allNear = true;
  }

  get objects(): THREE.InstancedMesh[] {
    return this.levels.flat();
  }

  /**
   * Re-buckets by distance from `camera` (null: everything near). `near` and `far` are the
   * distances where the mid and far levels begin. Allocation-free.
   */
  update(camera: { x: number; y: number; z: number } | null, near: number, far: number): void {
    if (!camera && this.allNear) return;
    this.allNear = !camera;
    const nearSq = near * near;
    const farSq = far * far;
    const counts = this.counts;
    counts.fill(0);
    const positions = this.positions;
    const total = positions.length / 3;
    const last = this.levels.length - 1;
    for (let i = 0; i < total; i += 1) {
      let level = 0;
      if (camera) {
        const dx = (positions[i * 3] ?? 0) - camera.x;
        const dy = (positions[i * 3 + 1] ?? 0) - camera.y;
        const dz = (positions[i * 3 + 2] ?? 0) - camera.z;
        const d = dx * dx + dy * dy + dz * dz;
        level = Math.min(last, d < nearSq ? 0 : d < farSq ? 1 : 2);
      }
      const slot = counts[level] ?? 0;
      counts[level] = slot + 1;
      const parts = this.levels[level];
      if (!parts) continue;
      for (let p = 0; p < parts.length; p += 1) {
        const target = parts[p]?.instanceMatrix.array as Float32Array | undefined;
        if (!target) continue;
        for (let k = 0; k < 16; k += 1) target[slot * 16 + k] = this.matrices[i * 16 + k] ?? 0;
      }
    }
    for (let level = 0; level < this.levels.length; level += 1) {
      const parts = this.levels[level];
      if (!parts) continue;
      for (let p = 0; p < parts.length; p += 1) {
        const mesh = parts[p];
        if (!mesh) continue;
        mesh.count = counts[level] ?? 0;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    for (const mesh of this.objects) mesh.dispose();
  }
}
