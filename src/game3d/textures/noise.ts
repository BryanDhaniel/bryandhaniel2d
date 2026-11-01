import * as THREE from "three";
import { hash2 } from "@/game/art/pixels";

/**
 * Tileable value noise (two octaves), used for the drifting cloud shadows and fog banks.
 * Pure: returns the bytes so it can be tested without WebGL.
 */
export function tileableNoise(size: number, cells: number, seed: number): Uint8Array {
  const data = new Uint8Array(size * size);
  const octave = (x: number, y: number, period: number, offset: number) => {
    const fx = (x / size) * period;
    const fy = (y / size) * period;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const at = (gx: number, gy: number) =>
      hash2(((gx % period) + period) % period, ((gy % period) + period) % period, seed + offset);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return top + (bottom - top) * sy;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = octave(x, y, cells, 0) * 0.7 + octave(x, y, cells * 2, 7) * 0.3;
      data[y * size + x] = Math.round(value * 255);
    }
  }
  return data;
}

export function createNoiseTexture(size = 64, cells = 4, seed = 5): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    tileableNoise(size, cells, seed),
    size,
    size,
    THREE.RedFormat,
  );
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
