import { hash2 } from "@/game/art/pixels";
import { WATER } from "@/game/config/visuals";
import { tileLayer } from "@/game/map/navigation";
import { FIRST_GID, LAYER, TILESET, isWaterGid, type TiledMap } from "@/game/map/tiled";

/**
 * World-sized mask for the water post pass, one texel per world pixel:
 * R = water (minus a thin shore inset), G = how many texels below the shoreline this pixel
 * is (for mirroring reflections), B = a puddle that shines while it rains. A is always 255.
 */
export function computeWaterMask(map: TiledMap): {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
} {
  const tw = map.tilewidth;
  const th = map.tileheight;
  const width = map.width * tw;
  const height = map.height * th;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 3; i < data.length; i += 4) {
    data[i] = 255;
  }
  const ground = tileLayer(map, LAYER.ground)?.data ?? [];
  const isWater = (tx: number, ty: number) => {
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return true;
    return isWaterGid(ground[ty * map.width + tx] ?? 0);
  };
  const inset = WATER.shoreInset;

  for (let ty = 0; ty < map.height; ty += 1) {
    for (let tx = 0; tx < map.width; tx += 1) {
      if (!isWater(tx, ty)) continue;
      const top = isWater(tx, ty - 1) ? 0 : inset;
      const bottom = isWater(tx, ty + 1) ? 0 : inset;
      const left = isWater(tx - 1, ty) ? 0 : inset;
      const right = isWater(tx + 1, ty) ? 0 : inset;
      for (let y = top; y < th - bottom; y += 1) {
        for (let x = left; x < tw - right; x += 1) {
          data[((ty * th + y) * width + tx * tw + x) * 4] = 255;
        }
      }
    }
  }

  // Distance below the first water texel of each vertical run (capped at 255).
  for (let x = 0; x < width; x += 1) {
    let run = 0;
    for (let y = 0; y < height; y += 1) {
      const i = (y * width + x) * 4;
      if ((data[i] ?? 0) > 0) {
        data[i + 1] = Math.min(run, 255);
        run += 1;
      } else {
        run = 0;
      }
    }
  }

  // Puddles on a deterministic selection of dirt-path tiles.
  const pathTiles: number[] = [];
  ground.forEach((value, index) => {
    const local = value - FIRST_GID;
    if (local >= TILESET.path && local < TILESET.path + 16) pathTiles.push(index);
  });
  pathTiles.sort((a, b) => hash2(a, 1, 41) - hash2(b, 1, 41));
  for (const index of pathTiles.slice(0, WATER.puddles)) {
    const tx = index % map.width;
    const ty = Math.floor(index / map.width);
    const cx = tx * tw + 4 + Math.floor(hash2(tx, ty, 43) * (tw - 8));
    const cy = ty * th + 5 + Math.floor(hash2(tx, ty, 44) * (th - 10));
    const rx = 3 + Math.floor(hash2(tx, ty, 45) * 3);
    const ry = 1 + Math.floor(hash2(tx, ty, 46) * 2);
    for (let y = -ry; y <= ry; y += 1) {
      for (let x = -rx; x <= rx; x += 1) {
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) > 1) continue;
        const px = cx + x;
        const py = cy + y;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        data[(py * width + px) * 4 + 2] = 255;
      }
    }
  }
  return { width, height, data };
}

/** Paints the mask into a canvas the renderer can upload as a texture. */
export function waterMaskCanvas(map: TiledMap): HTMLCanvasElement {
  const mask = computeWaterMask(map);
  const canvas = document.createElement("canvas");
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.putImageData(new ImageData(mask.data, mask.width, mask.height), 0, 0);
  }
  return canvas;
}
