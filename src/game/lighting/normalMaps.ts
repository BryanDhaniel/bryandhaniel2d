import { LIGHTING } from "@/game/config/visuals";

/**
 * Generates normal maps for the programmatic art (the same idea as Laigter or
 * SpriteIlluminator): a height field from a bevel along each sprite's silhouette plus a bit of
 * luminance detail, turned into normals with a Sobel filter. Output follows the OpenGL
 * convention (green = up), matching hand-made maps exported from Laigter by default.
 */

export interface NormalMapOptions {
  /** Width of the silhouette bevel in pixels (0 for opaque tiles). */
  bevel: number;
  bevelStrength: number;
  /** How much brightness differences read as bumps. */
  detailStrength: number;
  /** Clamp sampling to cells of this size (tilesets, so tiles don't bleed into neighbours). */
  cell: number;
  greenUp: boolean;
}

export const NORMAL_PRESETS = {
  sprites: {
    bevel: 3,
    bevelStrength: 1.6,
    detailStrength: 0.9,
    cell: 0,
    greenUp: LIGHTING.normalMapGreenUp,
  },
  tiles: {
    bevel: 0,
    bevelStrength: 0,
    detailStrength: 1.4,
    cell: 16,
    greenUp: LIGHTING.normalMapGreenUp,
  },
} as const satisfies Record<string, NormalMapOptions>;

/** Chamfer distance (in pixels) from each opaque pixel to the nearest transparent one. */
function edgeDistance(alpha: Uint8Array, width: number, height: number, cap: number): Float32Array {
  const distance = new Float32Array(width * height);
  const big = cap + 1;
  for (let i = 0; i < distance.length; i += 1) {
    distance[i] = (alpha[i] ?? 0) > 0 ? big : 0;
  }
  const diagonal = Math.SQRT2;
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : (distance[y * width + x] ?? 0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const d = distance[i] ?? 0;
      if (d === 0) continue;
      distance[i] = Math.min(
        d,
        at(x - 1, y) + 1,
        at(x, y - 1) + 1,
        at(x - 1, y - 1) + diagonal,
        at(x + 1, y - 1) + diagonal,
      );
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const i = y * width + x;
      const d = distance[i] ?? 0;
      if (d === 0) continue;
      distance[i] = Math.min(
        d,
        at(x + 1, y) + 1,
        at(x, y + 1) + 1,
        at(x + 1, y + 1) + diagonal,
        at(x - 1, y + 1) + diagonal,
      );
    }
  }
  return distance;
}

/**
 * Computes an RGBA normal map from RGBA pixels. Pure (no DOM), so it can be unit-tested and
 * run on any image data.
 */
export function computeNormalMap(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: NormalMapOptions,
): Uint8ClampedArray<ArrayBuffer> {
  const count = width * height;
  const alpha = new Uint8Array(count);
  const heightField = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const a = pixels[i * 4 + 3] ?? 0;
    alpha[i] = a;
    if (a > 0) {
      const r = pixels[i * 4] ?? 0;
      const g = pixels[i * 4 + 1] ?? 0;
      const b = pixels[i * 4 + 2] ?? 0;
      heightField[i] = ((0.299 * r + 0.587 * g + 0.114 * b) / 255) * options.detailStrength;
    }
  }
  if (options.bevel > 0) {
    const distance = edgeDistance(alpha, width, height, options.bevel);
    for (let i = 0; i < count; i += 1) {
      if ((alpha[i] ?? 0) > 0) {
        const t = Math.min(distance[i] ?? 0, options.bevel) / options.bevel;
        // Ease so the rim rounds over rather than forming a straight chamfer.
        heightField[i] =
          (heightField[i] ?? 0) + Math.sin((t * Math.PI) / 2) * options.bevelStrength;
      }
    }
  }

  const cell = options.cell;
  const sample = (x: number, y: number, cx: number, cy: number) => {
    let sx = x;
    let sy = y;
    if (cell > 0) {
      sx = Math.min(Math.max(sx, cx), cx + cell - 1);
      sy = Math.min(Math.max(sy, cy), cy + cell - 1);
    }
    sx = Math.min(Math.max(sx, 0), width - 1);
    sy = Math.min(Math.max(sy, 0), height - 1);
    return heightField[sy * width + sx] ?? 0;
  };

  const out = new Uint8ClampedArray(count * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const o = i * 4;
      if ((alpha[i] ?? 0) === 0) {
        out[o] = 128;
        out[o + 1] = 128;
        out[o + 2] = 255;
        out[o + 3] = 255;
        continue;
      }
      const cx = cell > 0 ? x - (x % cell) : 0;
      const cy = cell > 0 ? y - (y % cell) : 0;
      const tl = sample(x - 1, y - 1, cx, cy);
      const t = sample(x, y - 1, cx, cy);
      const tr = sample(x + 1, y - 1, cx, cy);
      const l = sample(x - 1, y, cx, cy);
      const r = sample(x + 1, y, cx, cy);
      const bl = sample(x - 1, y + 1, cx, cy);
      const b = sample(x, y + 1, cx, cy);
      const br = sample(x + 1, y + 1, cx, cy);
      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) / 4;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) / 4;
      // Image space: +x right, +y down. A surface rising toward +x faces -x.
      let nx = -dx;
      let ny = -dy;
      let nz = 1;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;
      const green = options.greenUp ? -ny : ny;
      out[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((green * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Normal map for any drawable image, returned as a canvas ready for Texture.setDataSource. */
export function normalMapCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  options: NormalMapOptions,
): HTMLCanvasElement {
  const input = document.createElement("canvas");
  input.width = width;
  input.height = height;
  const inputCtx = input.getContext("2d", { willReadFrequently: true });
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputCtx = output.getContext("2d");
  if (!inputCtx || !outputCtx) {
    return output;
  }
  inputCtx.imageSmoothingEnabled = false;
  inputCtx.drawImage(source, 0, 0);
  const pixels = inputCtx.getImageData(0, 0, width, height).data;
  const normals = computeNormalMap(pixels, width, height, options);
  outputCtx.putImageData(new ImageData(normals, width, height), 0, 0);
  return output;
}
