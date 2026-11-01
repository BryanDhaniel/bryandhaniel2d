import type * as THREE from "three";
import { Painter } from "@/game/art/painter";
import { hash2 } from "@/game/art/pixels";
import type { PaletteName } from "@/game/palette";
import { pixelCanvas, pixelTexture } from "./canvas";

/**
 * Tiling pixel textures for walls, roofs, cliffs and props, painted from the palette at the
 * world's texel density (16 px per unit; UVs are in world units). Each surface is its own
 * small repeating texture, so any face of any size tiles cleanly.
 */

export const SURFACE_NAMES = [
  "plaster",
  "stone",
  "brick",
  "planks",
  "darkPlanks",
  "metal",
  "roofClay",
  "roofSlate",
  "roofThatch",
  "roofShingle",
  "roofMetal",
  "trim",
  "door",
  "earth",
  "grassLip",
  "kerb",
  "bank",
  "bed",
  "bark",
  "birchBark",
  "leaves",
  "needles",
  "birchLeaves",
  "bush",
  "rock",
  "clothRed",
  "clothViolet",
  "floor",
  "rug",
  "books",
  "rack",
  "glassWarm",
  "glassCool",
  "screen",
  "iron",
  "fruit",
] as const;

export type SurfaceName = (typeof SURFACE_NAMES)[number];

type Paint = (p: Painter, size: number) => void;

function speckle(
  p: Painter,
  size: number,
  colors: readonly PaletteName[],
  count: number,
  seed: number,
): void {
  for (let i = 0; i < count; i += 1) {
    const x = Math.floor(hash2(i, seed, 1) * size);
    const y = Math.floor(hash2(i, seed, 2) * size);
    p.px(x, y, colors[i % colors.length] ?? "ink");
  }
}

/** Rows of overlapping tiles for roofs: a base colour, a shade line and highlights. */
function roofRows(
  p: Painter,
  size: number,
  base: PaletteName,
  shade: PaletteName,
  light: PaletteName,
  rowHeight: number,
  tileWidth: number,
): void {
  p.rect(0, 0, size, size, base);
  for (let y = 0; y < size; y += rowHeight) {
    p.hline(0, y + rowHeight - 1, size, shade);
    const offset = (y / rowHeight) % 2 === 0 ? 0 : tileWidth / 2;
    for (let x = offset; x < size + tileWidth; x += tileWidth) {
      p.vline((x % size) | 0, y, rowHeight - 1, shade);
      p.px(((x + 1) % size) | 0, y, light);
    }
  }
}

function blocks(
  p: Painter,
  size: number,
  fill: PaletteName,
  mortar: PaletteName,
  light: PaletteName,
  blockW: number,
  blockH: number,
  seed: number,
): void {
  p.rect(0, 0, size, size, mortar);
  for (let row = 0; row * blockH < size; row += 1) {
    const offset = row % 2 === 0 ? 0 : blockW / 2;
    for (let x = -offset; x < size; x += blockW) {
      const shadeVariant = hash2(Math.floor(x), row, seed) > 0.7;
      const x0 = Math.max(0, x);
      const w = Math.min(size, x + blockW - 1) - x0;
      if (w > 0) {
        p.rect(x0, row * blockH, w, blockH - 1, shadeVariant ? light : fill);
      }
    }
  }
}

const PAINTERS: Record<SurfaceName, { size: number; paint: Paint }> = {
  plaster: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "wheat");
      speckle(p, s, ["cloud", "sand", "cloud"], 14, 1);
    },
  },
  stone: { size: 16, paint: (p, s) => blocks(p, s, "stone", "slate", "mist", 8, 5, 2) },
  brick: { size: 16, paint: (p, s) => blocks(p, s, "brick", "bark", "clay", 6, 3, 3) },
  planks: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "wood");
      for (let x = 3; x < s; x += 4) p.vline(x, 0, s, "bark");
      speckle(p, s, ["sand", "bark"], 8, 4);
    },
  },
  darkPlanks: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "bark");
      for (let y = 3; y < s; y += 4) p.hline(0, y, s, "ink");
      speckle(p, s, ["wood"], 8, 5);
    },
  },
  metal: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "mist");
      p.hline(0, 7, s, "stone");
      p.vline(7, 0, s, "stone");
      for (const [x, y] of [
        [2, 2],
        [12, 2],
        [2, 12],
        [12, 12],
      ] as const)
        p.px(x, y, "slate");
      speckle(p, s, ["frost"], 6, 6);
    },
  },
  roofClay: { size: 16, paint: (p, s) => roofRows(p, s, "clay", "brick", "ember", 4, 4) },
  roofSlate: { size: 16, paint: (p, s) => roofRows(p, s, "slate", "night", "stone", 4, 6) },
  roofThatch: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "ochre");
      for (let i = 0; i < 40; i += 1) {
        const x = Math.floor(hash2(i, 7, 1) * s);
        const y = Math.floor(hash2(i, 7, 2) * s);
        p.vline(x, y, 3, i % 3 === 0 ? "olive" : i % 3 === 1 ? "wood" : "wheat");
      }
      p.hline(0, 7, s, "wood");
      p.hline(0, 15, s, "wood");
    },
  },
  roofShingle: { size: 16, paint: (p, s) => roofRows(p, s, "wood", "bark", "sand", 4, 5) },
  roofMetal: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "teal");
      for (let x = 0; x < s; x += 4) {
        p.vline(x, 0, s, "deep");
        p.vline(x + 1, 0, s, "foam");
      }
    },
  },
  trim: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "bark");
      speckle(p, s, ["wood", "ink"], 10, 8);
    },
  },
  door: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "wood");
      for (let x = 3; x < s; x += 4) p.vline(x, 0, s, "bark");
      p.hline(0, 3, s, "slate");
      p.hline(0, 12, s, "slate");
      p.px(12, 8, "gold");
    },
  },
  earth: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "bark");
      for (let i = 0; i < 18; i += 1) {
        const x = Math.floor(hash2(i, 9, 1) * s);
        const y = Math.floor(hash2(i, 9, 2) * s);
        p.rect(x, y, 2, 1, i % 4 === 0 ? "stone" : i % 4 === 1 ? "wood" : "ink");
      }
      p.hline(0, 9, s, "wood");
    },
  },
  grassLip: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "grass");
      for (let x = 0; x < s; x += 1) {
        const drop = 2 + Math.floor(hash2(x, 10, 1) * 3);
        p.vline(x, s - drop, drop, "leaf");
        if (hash2(x, 10, 2) > 0.7) p.px(x, 1, "lime");
      }
    },
  },
  kerb: { size: 16, paint: (p, s) => blocks(p, s, "mist", "stone", "cloud", 8, 4, 11) },
  bank: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "wood");
      speckle(p, s, ["sand", "bark", "stone", "mist"], 26, 12);
    },
  },
  bed: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "sand");
      speckle(p, s, ["wood", "stone", "wheat"], 22, 13);
    },
  },
  bark: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "wood");
      for (let x = 1; x < s; x += 3) p.vline(x, 0, s, "bark");
      speckle(p, s, ["ink"], 6, 14);
    },
  },
  birchBark: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "cloud");
      for (let i = 0; i < 9; i += 1) {
        const y = Math.floor(hash2(i, 15, 1) * s);
        const x = Math.floor(hash2(i, 15, 2) * s);
        p.hline(x, y, 3, "ink");
      }
    },
  },
  leaves: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "leaf");
      speckle(p, s, ["grass", "forest", "grass", "lime"], 60, 16);
    },
  },
  needles: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "forest");
      for (let i = 0; i < 30; i += 1) {
        const x = Math.floor(hash2(i, 17, 1) * s);
        const y = Math.floor(hash2(i, 17, 2) * s);
        p.hline(x, y, 2, i % 2 === 0 ? "leaf" : "moss");
      }
    },
  },
  birchLeaves: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "grass");
      speckle(p, s, ["lime", "olive", "leaf", "lime"], 60, 18);
    },
  },
  bush: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "leaf");
      speckle(p, s, ["forest", "grass", "forest"], 50, 19);
      speckle(p, s, ["ember", "gold"], 4, 20);
    },
  },
  rock: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "stone");
      speckle(p, s, ["slate", "mist", "slate", "moss"], 40, 21);
    },
  },
  clothRed: {
    size: 16,
    paint: (p, s) => {
      for (let x = 0; x < s; x += 1)
        p.vline(x, 0, s, Math.floor(x / 4) % 2 === 0 ? "ember" : "cloud");
    },
  },
  clothViolet: {
    size: 16,
    paint: (p, s) => {
      for (let x = 0; x < s; x += 1)
        p.vline(x, 0, s, Math.floor(x / 4) % 2 === 0 ? "violet" : "cloud");
    },
  },
  floor: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "sand");
      for (let y = 3; y < s; y += 4) p.hline(0, y, s, "wood");
      speckle(p, s, ["wheat"], 6, 22);
    },
  },
  rug: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "brick");
      p.frame(1, 1, s - 2, s - 2, "gold");
      p.frame(4, 4, s - 8, s - 8, "rose");
    },
  },
  books: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "bark");
      const colors: readonly PaletteName[] = ["brick", "deep", "moss", "ochre", "violet", "teal"];
      for (let shelf = 0; shelf < 2; shelf += 1) {
        for (let x = 1; x < s - 1; x += 2) {
          const h = 5 + Math.floor(hash2(x, shelf, 23) * 2);
          p.rect(x, shelf * 8 + 7 - h, 1, h, colors[(x + shelf) % colors.length] ?? "brick");
        }
        p.hline(0, shelf * 8 + 7, s, "wood");
      }
    },
  },
  rack: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "night");
      for (let y = 1; y < s; y += 3) {
        p.hline(1, y, s - 2, "slate");
        p.px(2, y + 1, "ink");
      }
    },
  },
  glassWarm: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "gold");
      p.rect(1, 1, 6, 6, "sun");
      p.rect(9, 9, 6, 6, "sun");
      p.vline(7, 0, s, "bark");
      p.vline(8, 0, s, "bark");
      p.hline(0, 7, s, "bark");
      p.hline(0, 8, s, "bark");
    },
  },
  glassCool: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "sky");
      p.rect(1, 1, 6, 6, "foam");
      p.vline(7, 0, s, "deep");
      p.hline(0, 7, s, "deep");
    },
  },
  screen: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "deep");
      for (let x = 1; x < s - 1; x += 2) {
        const h = 2 + Math.floor(hash2(x, 24, 1) * 9);
        p.rect(x, s - 2 - h, 1, h, x % 4 === 1 ? "sky" : "teal");
      }
      p.hline(1, 2, 9, "foam");
    },
  },
  iron: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "slate");
      speckle(p, s, ["night", "stone"], 14, 25);
    },
  },
  fruit: {
    size: 16,
    paint: (p, s) => {
      p.rect(0, 0, s, s, "wood");
      const colors: readonly PaletteName[] = ["ember", "gold", "lime", "rose", "sun"];
      for (let i = 0; i < 26; i += 1) {
        const x = Math.floor(hash2(i, 26, 1) * (s - 2));
        const y = Math.floor(hash2(i, 26, 2) * (s - 2));
        p.rect(x, y, 2, 2, colors[i % colors.length] ?? "ember");
      }
    },
  },
};

export type SurfaceTextures = Record<SurfaceName, THREE.CanvasTexture>;

/** Paints every surface. Textures repeat, so UVs in world units tile at 16 px per unit. */
export function createSurfaceTextures(): SurfaceTextures {
  const entries = SURFACE_NAMES.map((name) => {
    const { size, paint } = PAINTERS[name];
    const { canvas, ctx } = pixelCanvas(size, size);
    paint(new Painter(ctx, 0, 0, size, size), size);
    const texture = pixelTexture(canvas, true);
    texture.name = name;
    // A 16 px texture spans one world unit; larger textures span proportionally more.
    texture.repeat.set(16 / size, 16 / size);
    return [name, texture] as const;
  });
  return Object.fromEntries(entries) as SurfaceTextures;
}
