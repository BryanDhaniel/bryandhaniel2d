import * as THREE from "three";

/** A 2D canvas for painting pixel art (no smoothing). */
export function pixelCanvas(
  width: number,
  height: number,
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas is not available.");
  }
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/**
 * Wraps a painted canvas as a nearest-filtered sRGB texture, so it reads as pixel art at any
 * zoom. `repeat` turns on wrapping for tiling surfaces.
 */
export function pixelTexture(source: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  return texture;
}
