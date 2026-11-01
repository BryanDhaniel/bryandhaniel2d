import type { TreeVariant } from "@/game/map/village";
import { Painter, circle, paintBlob, union, type Mask } from "./painter";
import { type PixelArt } from "./pixels";

/**
 * Trees and grass tufts sway in the wind shader, which bends each sprite by how far up the
 * frame a vertex is (v = 0 at the top, 1 at the bottom). That only works if every frame spans
 * the full texture height, so these live in single-row "strip" textures rather than the
 * packed atlases. A replacement image must keep that layout: frames side by side, same height.
 */

export interface StripFrame {
  name: string;
  x: number;
  width: number;
}

export interface StripLayout {
  width: number;
  height: number;
  frames: StripFrame[];
}

export interface StripSpec {
  height: number;
  frames: { name: string; width: number; paint: (p: Painter) => void }[];
}

/** Frames side by side with a 1px transparent gutter so nearest sampling never bleeds. */
export function stripLayout(spec: StripSpec): StripLayout {
  let x = 0;
  const frames: StripFrame[] = spec.frames.map((frame) => {
    const placed = { name: frame.name, x, width: frame.width };
    x += frame.width + 1;
    return placed;
  });
  return { width: Math.max(1, x - 1), height: spec.height, frames };
}

export function paintStrip(
  ctx: CanvasRenderingContext2D,
  spec: StripSpec,
  layout: StripLayout,
): void {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, layout.width, layout.height);
  spec.frames.forEach((frame, i) => {
    const placed = layout.frames[i];
    if (placed) {
      frame.paint(new Painter(ctx, placed.x, 0, placed.width, spec.height));
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Trees (40 px tall; feet at the bottom centre)
// ---------------------------------------------------------------------------------------------

export const TREE_HEIGHT = 40;

export const TREE_WIDTHS: Record<TreeVariant, number> = {
  oak: 32,
  pine: 24,
  birch: 26,
};

function paintOak(p: Painter): void {
  p.box(13, 26, 6, 14, "bark", "ink");
  p.vline(14, 27, 12, "wood");
  p.px(12, 39, "ink");
  p.px(19, 39, "ink");
  const canopy = union(circle(16, 12, 10), circle(8, 17, 7), circle(24, 17, 7), circle(16, 20, 8));
  paintBlob(p, canopy, {
    outline: "ink",
    base: "leaf",
    light: "grass",
    shade: "forest",
    speckle: "lime",
    speckleDensity: 0.06,
    seed: 5,
  });
  p.px(10, 16, "ember");
  p.px(21, 12, "ember");
  p.px(18, 22, "ember");
}

function triangle(apexX: number, apexY: number, baseY: number, halfWidth: number): Mask {
  return (x, y) => {
    if (y < apexY || y > baseY) return false;
    const t = (y - apexY) / Math.max(1, baseY - apexY);
    return Math.abs(x + 0.5 - apexX) <= halfWidth * t + 0.6;
  };
}

function paintPine(p: Painter): void {
  p.box(10, 32, 4, 8, "bark", "ink");
  p.vline(11, 33, 6, "wood");
  const canopy = union(triangle(12, 1, 14, 6), triangle(12, 8, 24, 9), triangle(12, 15, 34, 11));
  paintBlob(p, canopy, {
    outline: "ink",
    base: "forest",
    light: "leaf",
    shade: "night",
    speckle: "grass",
    speckleDensity: 0.05,
    seed: 17,
  });
  // Tier edges catch the light.
  for (const [y, half] of [
    [14, 5],
    [24, 8],
    [33, 10],
  ] as const) {
    for (let x = 12 - half; x <= 12 + half; x += 2) p.px(x, y - 1, "leaf");
  }
}

function paintBirch(p: Painter): void {
  p.box(11, 18, 4, 22, "cloud", "ink");
  for (let y = 21; y < 39; y += 3) p.hline(12 + (y % 2), y, 2, "ink");
  p.vline(14, 19, 20, "mist");
  const canopy = union(circle(13, 11, 9), circle(7, 15, 6), circle(19, 15, 6), circle(13, 18, 6));
  paintBlob(p, canopy, {
    outline: "ink",
    base: "grass",
    light: "lime",
    shade: "leaf",
    speckle: "gold",
    speckleDensity: 0.05,
    seed: 23,
  });
}

const TREE_PAINTERS: Record<TreeVariant, (p: Painter) => void> = {
  oak: paintOak,
  pine: paintPine,
  birch: paintBirch,
};

export const TREE_STRIP: StripSpec = {
  height: TREE_HEIGHT,
  frames: (Object.keys(TREE_WIDTHS) as TreeVariant[]).map((variant) => ({
    name: variant,
    width: TREE_WIDTHS[variant],
    paint: TREE_PAINTERS[variant],
  })),
};

// ---------------------------------------------------------------------------------------------
// Grass tufts (8x8; planted on grass tiles)
// ---------------------------------------------------------------------------------------------

export const TUFT_SIZE = 8;

const TUFTS: readonly PixelArt[] = [
  ["........", "...L....", ".L.l..L.", ".l.lL.l.", ".lGlGlL.", "..lGlGl.", "..GlGlG.", "...lll.."],
  ["....Y...", "...YOY..", "..L.l.L.", "..l.l.l.", ".lG.lGl.", ".lGlGl..", "..GlGlG.", "...lll.."],
  [".L....L.", ".l.L..l.", "Ll.l.Ll.", "lG.lLlG.", "lGllGlG.", ".GlGlGl.", ".GGlGlG.", "..llll.."],
];

export const TUFT_STRIP: StripSpec = {
  height: TUFT_SIZE,
  frames: TUFTS.map((art, i) => ({
    name: `tuft/${i}`,
    width: TUFT_SIZE,
    paint: (p: Painter) => p.art(art, 0, 0),
  })),
};
