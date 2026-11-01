import * as THREE from "three";
import { WORLD } from "@/game3d/config/visuals";
import { tileUv } from "@/game3d/textures/tileset";
import type { WorldLayout } from "@/game3d/world/layout";

/**
 * Terrain meshes built from the tile grid: flat tile tops textured from the autotiled ground
 * set, vertical sides wherever the ground steps down (grass cliffs, the plaza kerb, pond
 * banks, the diorama's earth skirt), grassy lips on cliff edges and the pond beds. Side
 * faces carry a vertex-colour gradient that darkens toward their base (baked occlusion).
 */

class MeshData {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly uvs1: number[] = [];
  readonly colors: number[] = [];

  quad(
    corners: readonly (readonly [number, number, number])[],
    normal: readonly [number, number, number],
    uv: readonly (readonly [number, number])[],
    shade: readonly number[] = [1, 1, 1, 1],
    uv1?: readonly (readonly [number, number])[],
  ): void {
    // Two triangles: 0-1-2, 0-2-3.
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const corner = corners[index] ?? [0, 0, 0];
      this.positions.push(corner[0], corner[1], corner[2]);
      this.normals.push(normal[0], normal[1], normal[2]);
      const coord = uv[index] ?? [0, 0];
      this.uvs.push(coord[0], coord[1]);
      const coord1 = uv1?.[index] ?? coord;
      this.uvs1.push(coord1[0], coord1[1]);
      const c = shade[index] ?? 1;
      this.colors.push(c, c, c);
    }
  }

  toGeometry(withUv1: boolean, withColors: boolean): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    if (withUv1) geometry.setAttribute("uv1", new THREE.Float32BufferAttribute(this.uvs1, 2));
    if (withColors)
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

export interface TerrainGeometry {
  /** Tile tops (tileset UVs, AO coordinates in uv1). */
  top: THREE.BufferGeometry;
  earth: THREE.BufferGeometry;
  kerb: THREE.BufferGeometry;
  bank: THREE.BufferGeometry;
  lip: THREE.BufferGeometry;
  bed: THREE.BufferGeometry;
}

const SIDES = [
  { dx: 0, dz: -1, normal: [0, 0, -1] as const },
  { dx: 1, dz: 0, normal: [1, 0, 0] as const },
  { dx: 0, dz: 1, normal: [0, 0, 1] as const },
  { dx: -1, dz: 0, normal: [-1, 0, 0] as const },
];

export function buildTerrainGeometry(layout: WorldLayout): TerrainGeometry {
  const { width, height, heights, village } = layout;
  const top = new MeshData();
  const earth = new MeshData();
  const kerb = new MeshData();
  const bank = new MeshData();
  const lip = new MeshData();
  const bed = new MeshData();
  const rect = new Float32Array(4);
  const isWet = (i: number) => village.ground[i] === "water" || village.ground[i] === "bridge";

  for (let z = 0; z < height; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = z * width + x;
      const h = heights[i] ?? 0;
      // AO texture rows run with z (data textures are not flipped).
      const ao: readonly (readonly [number, number])[] = [
        [x / width, z / height],
        [(x + 1) / width, z / height],
        [(x + 1) / width, (z + 1) / height],
        [x / width, (z + 1) / height],
      ];
      const corners = [
        [x, h, z],
        [x + 1, h, z],
        [x + 1, h, z + 1],
        [x, h, z + 1],
      ] as const;
      // Counter-clockwise seen from above: (x,z) -> (x,z+1) -> (x+1,z+1) -> (x+1,z).
      const ordered = [corners[0], corners[3], corners[2], corners[1]];
      if (isWet(i)) {
        bed.quad(
          ordered,
          [0, 1, 0],
          [
            [x, -z],
            [x, -z - 1],
            [x + 1, -z - 1],
            [x + 1, -z],
          ],
        );
      } else {
        tileUv(layout.ground[i] ?? 1, rect);
        const [u0, v0, u1, v1] = [rect[0] ?? 0, rect[1] ?? 0, rect[2] ?? 1, rect[3] ?? 1];
        top.quad(
          ordered,
          [0, 1, 0],
          [
            [u0, v1],
            [u0, v0],
            [u1, v0],
            [u1, v1],
          ],
          [1, 1, 1, 1],
          [ao[0] ?? [0, 0], ao[3] ?? [0, 0], ao[2] ?? [0, 0], ao[1] ?? [0, 0]],
        );
      }

      for (const side of SIDES) {
        const nx = x + side.dx;
        const nz = z + side.dz;
        const outside = nx < 0 || nz < 0 || nx >= width || nz >= height;
        const neighbour = outside ? -WORLD.baseDepth : (heights[nz * width + nx] ?? 0);
        if (neighbour >= h - 1e-4) continue;
        // Edge endpoints, ordered so the quad faces outward.
        let ax: number;
        let az: number;
        let bx: number;
        let bz: number;
        if (side.dz === -1) [ax, az, bx, bz] = [x + 1, z, x, z];
        else if (side.dx === 1) [ax, az, bx, bz] = [x + 1, z + 1, x + 1, z];
        else if (side.dz === 1) [ax, az, bx, bz] = [x, z + 1, x + 1, z + 1];
        else [ax, az, bx, bz] = [x, z, x, z + 1];
        const u0 = side.dx === 0 ? ax : az;
        const u1 = side.dx === 0 ? bx : bz;
        const quad = [
          [ax, neighbour, az],
          [bx, neighbour, bz],
          [bx, h, bz],
          [ax, h, az],
        ] as const;
        const uv = [
          [u0, neighbour],
          [u1, neighbour],
          [u1, h],
          [u0, h],
        ] as const;
        const depth = h - neighbour;
        const baseShade = depth > 1 ? 0.45 : 0.62;
        const shade = [baseShade, baseShade, 1, 1];
        const landNextToWater = !outside && isWet(nz * width + nx) && !isWet(i);
        const target =
          village.ground[i] === "cobble" ? kerb : landNextToWater ? bank : isWet(i) ? bank : earth;
        target.quad(quad, side.normal, uv, shade);
        if (target === earth || (target === bank && h >= 0)) {
          // A ragged grass lip overhanging the top edge.
          const out = 0.02;
          const ox = side.normal[0] * out;
          const oz = side.normal[2] * out;
          const lipQuad = [
            [ax + ox, h - 0.24, az + oz],
            [bx + ox, h - 0.24, bz + oz],
            [bx + ox, h + 0.005, bz + oz],
            [ax + ox, h + 0.005, az + oz],
          ] as const;
          lip.quad(lipQuad, side.normal, [
            [u0, 0],
            [u1, 0],
            [u1, 0.25],
            [u0, 0.25],
          ]);
        }
      }
    }
  }

  return {
    top: top.toGeometry(true, false),
    earth: earth.toGeometry(false, true),
    kerb: kerb.toGeometry(false, true),
    bank: bank.toGeometry(false, true),
    lip: lip.toGeometry(false, false),
    bed: bed.toGeometry(false, false),
  };
}

/**
 * Baked ambient occlusion for the ground (4 texels per tile): darker around building
 * footprints, trunks, rocks, bushes and at the foot of every step. Pure, for testing.
 */
export function computeGroundOcclusion(layout: WorldLayout, resolution = 4): Uint8Array {
  const { width, height } = layout;
  const w = width * resolution;
  const h = height * resolution;
  const occupancy = new Float32Array(w * h);
  const stamp = (cx: number, cz: number, radius: number, weight: number) => {
    const x0 = Math.max(0, Math.floor((cx - radius) * resolution));
    const x1 = Math.min(w - 1, Math.ceil((cx + radius) * resolution));
    const z0 = Math.max(0, Math.floor((cz - radius) * resolution));
    const z1 = Math.min(h - 1, Math.ceil((cz + radius) * resolution));
    for (let z = z0; z <= z1; z += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = (x + 0.5) / resolution - cx;
        const dz = (z + 0.5) / resolution - cz;
        if (dx * dx + dz * dz <= radius * radius) {
          const index = z * w + x;
          occupancy[index] = Math.max(occupancy[index] ?? 0, weight);
        }
      }
    }
  };
  for (const building of layout.buildings) {
    const { rect } = building;
    for (let z = rect.y * resolution; z < (rect.y + rect.height) * resolution; z += 1) {
      for (let x = rect.x * resolution; x < (rect.x + rect.width) * resolution; x += 1) {
        occupancy[z * w + x] = 1;
      }
    }
  }
  for (const tree of layout.trees) stamp(tree.x, tree.z, 0.45 * tree.scale, 0.75);
  for (const rock of layout.rocks) stamp(rock.x, rock.z, 0.45, 0.7);
  for (const bush of layout.bushes) stamp(bush.x, bush.z, 0.5, 0.6);
  for (const entry of [...layout.wells, ...layout.stalls, ...layout.decor])
    stamp(entry.x, entry.z, 0.5, 0.55);
  if (layout.fountain) stamp(layout.fountain.x, layout.fountain.z, layout.fountain.radius, 0.6);
  // The foot of every step up (plaza kerb, cliffs, forest edge).
  for (let z = 0; z < height; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const here = layout.heights[z * width + x] ?? 0;
      for (const side of SIDES) {
        const nx = x + side.dx;
        const nz = z + side.dz;
        if (nx < 0 || nz < 0 || nx >= width || nz >= height) continue;
        if ((layout.heights[nz * width + nx] ?? 0) > here + 0.1) {
          stamp(x + 0.5 + side.dx * 0.5, z + 0.5 + side.dz * 0.5, 0.35, 0.65);
        }
      }
    }
  }
  // Two box-blur passes soften the stamps into occlusion.
  let source = occupancy;
  for (let pass = 0; pass < 2; pass += 1) {
    const blurred = new Float32Array(w * h);
    const r = 2;
    for (let z = 0; z < h; z += 1) {
      for (let x = 0; x < w; x += 1) {
        let sum = 0;
        let count = 0;
        for (let dz = -r; dz <= r; dz += 1) {
          for (let dx = -r; dx <= r; dx += 1) {
            const sx = x + dx;
            const sz = z + dz;
            if (sx < 0 || sz < 0 || sx >= w || sz >= h) continue;
            sum += source[sz * w + sx] ?? 0;
            count += 1;
          }
        }
        blurred[z * w + x] = sum / count;
      }
    }
    source = blurred;
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Math.round(Math.max(0.42, 1 - (source[i] ?? 0) * 0.75) * 255);
  }
  return out;
}
