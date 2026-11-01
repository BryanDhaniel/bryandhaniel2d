import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * A small modelling kit for procedural props and buildings. Every primitive gets UVs in world
 * units (one unit = 16 texels), so the pixel textures keep the same density on every face.
 * Parts are collected per (group, material) and merged into one mesh each when built.
 */

export type Placement = {
  x?: number;
  y?: number;
  z?: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
};

const tmpMatrix = new THREE.Matrix4();
const tmpEuler = new THREE.Euler();
const tmpQuat = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const UNIT = new THREE.Vector3(1, 1, 1);

function place(geometry: THREE.BufferGeometry, at: Placement): THREE.BufferGeometry {
  tmpEuler.set(at.rotX ?? 0, at.rotY ?? 0, at.rotZ ?? 0);
  tmpQuat.setFromEuler(tmpEuler);
  tmpPos.set(at.x ?? 0, at.y ?? 0, at.z ?? 0);
  tmpMatrix.compose(tmpPos, tmpQuat, UNIT);
  geometry.applyMatrix4(tmpMatrix);
  return geometry;
}

/** Box whose faces are UV-mapped in world units (u along the face width, v up the face). */
export function texturedBox(width: number, height: number, depth: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const uv = geometry.getAttribute("uv");
  // BoxGeometry faces: +x, -x, +y, -y, +z, -z, four vertices each.
  const sizes: readonly (readonly [number, number])[] = [
    [depth, height],
    [depth, height],
    [width, depth],
    [width, depth],
    [width, height],
    [width, height],
  ];
  for (let face = 0; face < 6; face += 1) {
    const [su, sv] = sizes[face] ?? [1, 1];
    for (let v = 0; v < 4; v += 1) {
      const i = face * 4 + v;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  return geometry.toNonIndexed();
}

export function texturedCylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments = 8,
  openEnded = false,
): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(
    radiusTop,
    radiusBottom,
    height,
    segments,
    1,
    openEnded,
  );
  const uv = geometry.getAttribute("uv");
  const circumference = Math.PI * 2 * Math.max(radiusTop, radiusBottom);
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, uv.getX(i) * circumference, uv.getY(i) * height);
  }
  return geometry.toNonIndexed();
}

/** Four-sided pyramid (hip roof) of the given base and height, base centred on the origin. */
export function pyramid(width: number, depth: number, height: number): THREE.BufferGeometry {
  const geometry = new THREE.ConeGeometry(Math.SQRT1_2, height, 4, 1);
  geometry.rotateY(Math.PI / 4);
  geometry.scale(width, 1, depth);
  geometry.translate(0, height / 2, 0);
  const uv = geometry.getAttribute("uv");
  const slant = Math.hypot(height, Math.max(width, depth) / 2);
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, uv.getX(i) * (width + depth) * 2, uv.getY(i) * slant);
  }
  return geometry.toNonIndexed();
}

export interface Hole {
  /** Left edge along the wall and bottom edge, in units. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A wall slab in the XY plane (extruded `thickness` toward +z), optionally with a gable peak,
 * window openings and a door cut out of the bottom edge. UVs come from the shape coordinates,
 * which are already world units.
 */
export function wallShape(
  length: number,
  height: number,
  thickness: number,
  holes: readonly Hole[] = [],
  gable = 0,
  door?: Hole,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  if (door) {
    shape.lineTo(door.x, 0);
    shape.lineTo(door.x, door.height);
    shape.lineTo(door.x + door.width, door.height);
    shape.lineTo(door.x + door.width, 0);
  }
  shape.lineTo(length, 0);
  shape.lineTo(length, height);
  if (gable > 0) {
    shape.lineTo(length / 2, height + gable);
  }
  shape.lineTo(0, height);
  shape.closePath();
  for (const hole of holes) {
    const path = new THREE.Path();
    path.moveTo(hole.x, hole.y);
    path.lineTo(hole.x, hole.y + hole.height);
    path.lineTo(hole.x + hole.width, hole.y + hole.height);
    path.lineTo(hole.x + hole.width, hole.y);
    path.closePath();
    shape.holes.push(path);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.clearGroups();
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

/** A flat quad facing +z (u along x, v along y), centred on the origin. */
export function texturedPlane(width: number, height: number): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, height);
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, uv.getX(i) * width, uv.getY(i) * height);
  }
  return geometry.toNonIndexed();
}

/** Low-poly blob (leaves, bushes): a slightly jittered icosphere with world-scaled UVs. */
export function blob(radius: number, seed: number, detail = 1): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453;
    const jitter = 1 + (n - Math.floor(n) - 0.5) * 0.18;
    position.setXYZ(i, x * jitter, y * jitter, z * jitter);
  }
  geometry.computeVertexNormals();
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    uv[i * 2] = position.getX(i) + position.getZ(i);
    uv[i * 2 + 1] = position.getY(i);
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

/** Collects parts per (group, material) and merges them into meshes. */
export class Kit {
  private readonly parts = new Map<
    string,
    { group: string; material: THREE.Material; geometries: THREE.BufferGeometry[] }
  >();

  add(
    group: string,
    material: THREE.Material,
    geometry: THREE.BufferGeometry,
    at: Placement = {},
  ): void {
    const key = `${group}|${material.uuid}`;
    let entry = this.parts.get(key);
    if (!entry) {
      entry = { group, material, geometries: [] };
      this.parts.set(key, entry);
    }
    entry.geometries.push(place(geometry, at));
  }

  box(
    group: string,
    material: THREE.Material,
    w: number,
    h: number,
    d: number,
    at: Placement,
  ): void {
    this.add(group, material, texturedBox(w, h, d), at);
  }

  cylinder(
    group: string,
    material: THREE.Material,
    r: number,
    h: number,
    at: Placement,
    segments = 8,
  ): void {
    this.add(group, material, texturedCylinder(r, r, h, segments), at);
  }

  /** Merges every collected part. Each mesh is tagged with its group in `userData.group`. */
  build(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const entry of this.parts.values()) {
      const merged = mergeGeometries(entry.geometries.map(stripToBasics), false);
      entry.geometries.forEach((geometry) => geometry.dispose());
      if (!merged) {
        continue;
      }
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, entry.material);
      mesh.userData.group = entry.group;
      meshes.push(mesh);
    }
    this.parts.clear();
    return meshes;
  }
}

/** Keeps only position, normal and uv so differently-built geometries can be merged. */
function stripToBasics(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const result = new THREE.BufferGeometry();
  const position = source.getAttribute("position");
  result.setAttribute("position", position);
  const normal = source.getAttribute("normal");
  if (normal) {
    result.setAttribute("normal", normal);
  } else {
    result.setAttribute("normal", position.clone());
    result.computeVertexNormals();
  }
  const uv = source.getAttribute("uv");
  result.setAttribute(
    "uv",
    uv ?? new THREE.BufferAttribute(new Float32Array(position.count * 2), 2),
  );
  return result;
}
