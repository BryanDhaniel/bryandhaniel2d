import * as THREE from "three";
import { PALETTE, type PaletteName } from "@/game/palette";
import { LUT_SIZE, type GradeParams } from "@/game3d/config/visuals";

function srgb(name: PaletteName): [number, number, number] {
  const value = Number.parseInt(PALETTE[name].slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/**
 * Bakes a colour grade into 3D LUT data (sRGB in, sRGB out; red varies fastest): white
 * balance, contrast, saturation, then shadows lifted toward one palette colour and highlights
 * tinted toward another. Pure, so the grades can be unit-tested.
 */
export function generateLut(params: GradeParams, size: number = LUT_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * size * 4);
  const lift = srgb(params.lift.color);
  const gain = srgb(params.gain.color);
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        let cr = r / (size - 1) + params.temperature * 0.08;
        let cg = g / (size - 1);
        let cb = b / (size - 1) - params.temperature * 0.08;
        cr = (cr - 0.5) * params.contrast + 0.5;
        cg = (cg - 0.5) * params.contrast + 0.5;
        cb = (cb - 0.5) * params.contrast + 0.5;
        const luma = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
        cr = luma + (cr - luma) * params.saturation;
        cg = luma + (cg - luma) * params.saturation;
        cb = luma + (cb - luma) * params.saturation;
        const shadow = params.lift.amount * (1 - Math.min(1, Math.max(0, luma)));
        const highlight = params.gain.amount * Math.min(1, Math.max(0, luma));
        cr = (cr + lift[0] * shadow) * (1 - highlight + gain[0] * highlight);
        cg = (cg + lift[1] * shadow) * (1 - highlight + gain[1] * highlight);
        cb = (cb + lift[2] * shadow) * (1 - highlight + gain[2] * highlight);
        const i = ((b * size + g) * size + r) * 4;
        data[i] = Math.round(Math.min(1, Math.max(0, cr)) * 255);
        data[i + 1] = Math.round(Math.min(1, Math.max(0, cg)) * 255);
        data[i + 2] = Math.round(Math.min(1, Math.max(0, cb)) * 255);
        data[i + 3] = 255;
      }
    }
  }
  return data;
}

export function lutTexture(data: Uint8Array, size: number = LUT_SIZE): THREE.Data3DTexture {
  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.wrapR = THREE.ClampToEdgeWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}
