import { MASK, TILESET } from "@/game/map/tiled";
import { TILE_SIZE } from "@/game/map/village";
import type { PaletteName } from "@/game/palette";
import { Painter, circle, ellipse, paintBlob, union } from "./painter";
import { hash2, type PixelArt } from "./pixels";

const T = TILE_SIZE;

export const TILESET_WIDTH = TILESET.columns * T;
export const TILESET_HEIGHT = TILESET.rows * T;

const TUFT: PixelArt = ["l.l", ".l."];

function tilePainter(ctx: CanvasRenderingContext2D, index: number): Painter {
  const col = index % TILESET.columns;
  const row = Math.floor(index / TILESET.columns);
  return new Painter(ctx, col * T, row * T, T, T);
}

function paintGrass(p: Painter, variant: number): void {
  p.rect(0, 0, T, T, "grass");
  for (let i = 0; i < 4; i += 1) {
    const x = Math.floor(hash2(variant, i, 21) * 13);
    const y = 1 + Math.floor(hash2(variant, i, 22) * 13);
    p.art(TUFT, x, y);
  }
  for (let i = 0; i < 5; i += 1) {
    const x = Math.floor(hash2(variant, i, 31) * T);
    const y = Math.floor(hash2(variant, i, 32) * T);
    p.px(x, y, "lime");
  }
}

const PETALS: readonly PaletteName[] = ["ember", "gold", "cloud", "violet"];

function paintFlowers(p: Painter, variant: number): void {
  paintGrass(p, variant + 4);
  for (let i = 0; i < 3; i += 1) {
    const x = 2 + Math.floor(hash2(variant, i, 41) * 11);
    const y = 2 + Math.floor(hash2(variant, i, 42) * 10);
    const petal = PETALS[(variant + i) % PETALS.length] ?? "gold";
    p.px(x, y + 2, "leaf");
    p.px(x - 1, y, petal);
    p.px(x + 1, y, petal);
    p.px(x, y - 1, petal);
    p.px(x, y + 1, petal);
    p.px(x, y, petal === "gold" ? "sun" : "gold");
  }
}

/** Grass creeping over the open sides of a path or shore tile. */
function grassEdges(p: Painter, mask: number, seed: number, depth: number): void {
  for (let i = 0; i < T; i += 1) {
    const jitter = hash2(i, seed, 51) > 0.65 ? 1 : 0;
    const d = depth + jitter;
    if (!(mask & MASK.N)) p.rect(i, 0, 1, d, "grass");
    if (!(mask & MASK.S)) p.rect(i, T - d, 1, d, "grass");
    if (!(mask & MASK.W)) p.rect(0, i, d, 1, "grass");
    if (!(mask & MASK.E)) p.rect(T - d, i, d, 1, "grass");
  }
  // Round the outer corners where two open sides meet.
  const c = depth;
  if (!(mask & MASK.N) && !(mask & MASK.W)) p.px(c, c, "grass");
  if (!(mask & MASK.N) && !(mask & MASK.E)) p.px(T - 1 - c, c, "grass");
  if (!(mask & MASK.S) && !(mask & MASK.W)) p.px(c, T - 1 - c, "grass");
  if (!(mask & MASK.S) && !(mask & MASK.E)) p.px(T - 1 - c, T - 1 - c, "grass");
}

function paintPath(p: Painter, mask: number): void {
  p.rect(0, 0, T, T, "sand");
  for (let i = 0; i < 6; i += 1) {
    p.px(Math.floor(hash2(mask, i, 61) * T), Math.floor(hash2(mask, i, 62) * T), "wheat");
  }
  for (let i = 0; i < 3; i += 1) {
    p.px(Math.floor(hash2(mask, i, 63) * T), Math.floor(hash2(mask, i, 64) * T), "wood");
  }
  grassEdges(p, mask, mask + 100, 2);
  // Light grass tips along the boundary.
  for (let i = 0; i < T; i += 3) {
    if (!(mask & MASK.N)) p.px(i + 1, 2, "lime");
    if (!(mask & MASK.S)) p.px(i, T - 3, "leaf");
  }
}

function paintWater(p: Painter, mask: number, frame: number): void {
  p.rect(0, 0, T, T, "water");
  for (let i = 0; i < 4; i += 1) {
    const x = Math.floor(hash2(mask, i, 71) * T);
    const y = Math.floor(hash2(mask, i, 72) * T);
    p.px(x, y, "deep");
  }
  // Ripples drift right each frame.
  for (let i = 0; i < 3; i += 1) {
    const baseX = Math.floor(hash2(i, mask, 73) * T);
    const y = 2 + i * 5 + Math.floor(hash2(i, mask, 74) * 2);
    const x = (baseX + frame * 2) % T;
    p.hline(x, y, 3, "sky");
    if (frame === 1) {
      p.px((x + 1) % T, y - 1, "foam");
    }
  }
  // Shore: grass, a sand line, then foam that shimmers between frames.
  const open = (bit: number) => !(mask & bit);
  for (let i = 0; i < T; i += 1) {
    const foam = (i + frame) % 3 !== 0;
    if (open(MASK.N)) {
      p.px(i, 2, "sand");
      if (foam) p.px(i, 3, "foam");
    }
    if (open(MASK.S)) {
      p.px(i, T - 3, "wood");
      if (foam) p.px(i, T - 4, "foam");
    }
    if (open(MASK.W)) {
      p.px(2, i, "sand");
      if (foam) p.px(3, i, "foam");
    }
    if (open(MASK.E)) {
      p.px(T - 3, i, "sand");
      if (foam) p.px(T - 4, i, "foam");
    }
  }
  grassEdges(p, mask, mask + 200, 2);
}

function paintFence(p: Painter, mask: number): void {
  const railRows = [5, 9];
  if (mask & MASK.W || mask & MASK.E) {
    for (const row of railRows) {
      const from = mask & MASK.W ? 0 : 6;
      const to = mask & MASK.E ? T : 10;
      p.hline(from, row - 1, to - from, "ink");
      p.hline(from, row, to - from, "sand");
      p.hline(from, row + 1, to - from, "wood");
      p.hline(from, row + 2, to - from, "ink");
    }
  }
  if (mask & MASK.N || mask & MASK.S) {
    const from = mask & MASK.N ? 0 : 4;
    const to = mask & MASK.S ? T : 12;
    p.vline(6, from, to - from, "ink");
    p.vline(7, from, to - from, "sand");
    p.vline(8, from, to - from, "wood");
    p.vline(9, from, to - from, "ink");
  }
  // Post with a shadow on the grass.
  p.hline(5, 14, 6, "leaf");
  p.box(5, 2, 6, 12, "wood", "ink");
  p.vline(6, 3, 10, "sand");
  p.vline(9, 3, 10, "bark");
  p.hline(6, 3, 3, "wheat");
}

function paintForest(p: Painter, mask: number): void {
  const openN = !(mask & MASK.N);
  const openS = !(mask & MASK.S);
  const openW = !(mask & MASK.W);
  const openE = !(mask & MASK.E);
  const top = openN ? 3 : 0;
  const bottom = openS ? 11 : T;
  const left = openW ? 2 : 0;
  const right = openE ? T - 2 : T;

  if (openS) {
    // Trunks and their shadow peek out below the canopy.
    p.hline(1, 14, 14, "leaf");
    for (const tx of [3, 10]) {
      p.box(tx, 9, 4, 6, "bark", "ink");
      p.vline(tx + 1, 10, 4, "wood");
    }
  }

  const bumps = union(
    (x, y) => x >= left && x < right && y >= top && y < bottom,
    ...(openN ? [circle(4, 4, 3), circle(11, 4, 3)] : []),
    ...(openS ? [circle(4, 10, 3), circle(11, 10, 3)] : []),
    ...(openW ? [circle(2, 5, 2), circle(2, 11, 2)] : []),
    ...(openE ? [circle(13, 5, 2), circle(13, 11, 2)] : []),
  );
  const canopy = (x: number, y: number) =>
    bumps(x, y) &&
    (!openN || y >= 1) &&
    (!openS || y <= 13) &&
    (!openW || x >= 0) &&
    (!openE || x <= T - 1);

  paintBlob(
    p,
    canopy,
    {
      outline: "ink",
      base: "leaf",
      light: "grass",
      shade: "forest",
      speckle: "lime",
      speckleDensity: 0.05,
      seed: mask,
    },
    { x: 0, y: 0, w: T, h: T },
    (x, y) => (y < 0 && openN) || (y >= T && openS) || (x < 0 && openW) || (x >= T && openE),
  );

  // Leaf clusters: small arcs of highlight and shade.
  for (let cy = 2; cy < T; cy += 5) {
    for (let cx = (cy % 2) * 3 + 1; cx < T; cx += 6) {
      if (canopy(cx, cy) && canopy(cx + 2, cy + 1) && canopy(cx, cy + 2)) {
        p.hline(cx, cy, 2, "grass");
        p.px(cx + 2, cy + 1, "forest");
        p.hline(cx, cy + 2, 2, "forest");
      }
    }
  }
}

function paintBush(p: Painter): void {
  p.hline(3, 14, 10, "forest");
  const shape = union(circle(5, 9, 4), circle(10, 9, 4), circle(8, 6, 4));
  paintBlob(p, shape, {
    outline: "ink",
    base: "leaf",
    light: "lime",
    shade: "forest",
    speckle: "grass",
    speckleDensity: 0.15,
  });
  p.px(5, 8, "ember");
  p.px(10, 10, "ember");
  p.px(8, 5, "ember");
}

function paintRock(p: Painter): void {
  p.hline(3, 14, 11, "leaf");
  paintBlob(p, ellipse(8, 10, 6.5, 4.5), {
    outline: "ink",
    base: "stone",
    light: "mist",
    shade: "slate",
    speckle: "slate",
    speckleDensity: 0.1,
    seed: 9,
  });
}

/** Cobblestones in staggered courses; open sides dither into the dirt they meet. */
function paintCobble(p: Painter, mask: number): void {
  p.rect(0, 0, T, T, "slate");
  for (let row = 0; row < 4; row += 1) {
    const y = row * 4;
    const offset = row % 2 === 0 ? 0 : 2;
    for (let i = -1; i < 4; i += 1) {
      const x = i * 4 + offset;
      // Stones that straddle the tile edge use the same tone on both sides of the seam.
      const tone = hash2((i + 4) % 4, row, 91);
      const face: PaletteName = tone > 0.8 ? "stone" : tone < 0.12 ? "wheat" : "mist";
      p.rect(x, y, 3, 3, face);
      p.px(x, y, face === "stone" ? "mist" : "cloud");
      p.px(x + 2, y + 2, "stone");
    }
  }
  const open = (bit: number) => !(mask & bit);
  for (let i = 0; i < T; i += 1) {
    for (let d = 0; d < 3; d += 1) {
      // Ordered dither: dense on the outermost row, sparse further in.
      const keep = d === 0 ? (i + d) % 4 !== 0 : d === 1 ? (i + d) % 2 === 0 : (i + d) % 4 === 0;
      if (!keep) continue;
      if (open(MASK.N)) p.px(i, d, d === 0 ? "sand" : "wood");
      if (open(MASK.S)) p.px(i, T - 1 - d, d === 0 ? "sand" : "wood");
      if (open(MASK.W)) p.px(d, i, d === 0 ? "sand" : "wood");
      if (open(MASK.E)) p.px(T - 1 - d, i, d === 0 ? "sand" : "wood");
    }
  }
}

/** Wooden deck over the creek: boards run across, rails along open north/south edges. */
function paintBridge(p: Painter, mask: number): void {
  p.rect(0, 0, T, T, "wood");
  for (let x = 0; x < T; x += 4) {
    p.vline(x + 3, 0, T, "bark");
    p.vline(x, 0, T, "sand");
    if (hash2(x, mask, 95) > 0.5) p.px(x + 1, Math.floor(hash2(x, 3, 96) * T), "bark");
  }
  const open = (bit: number) => !(mask & bit);
  if (open(MASK.N)) {
    p.hline(0, 0, T, "ink");
    p.hline(0, 1, T, "sand");
    p.hline(0, 2, T, "bark");
    p.hline(0, 3, T, "ink");
  }
  if (open(MASK.S)) {
    p.hline(0, T - 4, T, "ink");
    p.hline(0, T - 3, T, "sand");
    p.hline(0, T - 2, T, "bark");
    p.hline(0, T - 1, T, "ink");
  }
  // Posts where the deck meets the bank.
  for (const [bit, x] of [
    [MASK.W, 0],
    [MASK.E, T - 3],
  ] as const) {
    if (!open(bit)) continue;
    if (open(MASK.N)) p.box(x, 0, 3, 6, "bark", "ink");
    if (open(MASK.S)) p.box(x, T - 6, 3, 6, "bark", "ink");
  }
}

/** A wooden flower box; sits on the obstacle layer so the grass shows around it. */
function paintPlanter(p: Painter): void {
  p.hline(2, 15, 13, "forest");
  p.box(1, 8, 14, 7, "wood", "ink");
  p.hline(2, 9, 12, "bark");
  p.hline(2, 13, 12, "sand");
  const blooms: readonly [number, number, PaletteName][] = [
    [3, 5, "ember"],
    [6, 3, "gold"],
    [9, 5, "violet"],
    [12, 4, "cloud"],
  ];
  for (const [x, y, color] of blooms) {
    p.vline(x, y + 1, 9 - y - 1, "leaf");
    p.px(x - 1, y + 2, "grass");
    p.px(x + 1, y + 3, "grass");
    p.px(x, y, color);
    p.px(x - 1, y, color);
    p.px(x + 1, y, color);
    p.px(x, y - 1, color);
    p.px(x, y + 1 > 8 ? y : y + 1, "sun");
  }
}

/** Paints the whole tileset (layout defined by TILESET) onto its canvas. */
export function paintTileset(ctx: CanvasRenderingContext2D): void {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, TILESET_WIDTH, TILESET_HEIGHT);
  for (let v = 0; v < TILESET.grassVariants; v += 1) {
    paintGrass(tilePainter(ctx, TILESET.grass + v), v);
  }
  for (let v = 0; v < TILESET.flowerVariants; v += 1) {
    paintFlowers(tilePainter(ctx, TILESET.flowers + v), v);
  }
  paintBush(tilePainter(ctx, TILESET.bush));
  paintRock(tilePainter(ctx, TILESET.rock));
  paintPlanter(tilePainter(ctx, TILESET.planter));
  for (let mask = 0; mask < 16; mask += 1) {
    paintPath(tilePainter(ctx, TILESET.path + mask), mask);
    paintCobble(tilePainter(ctx, TILESET.cobble + mask), mask);
    paintBridge(tilePainter(ctx, TILESET.bridge + mask), mask);
    for (let frame = 0; frame < TILESET.waterFrames; frame += 1) {
      paintWater(tilePainter(ctx, TILESET.water + frame * 16 + mask), mask, frame);
    }
    paintFence(tilePainter(ctx, TILESET.fence + mask), mask);
    paintForest(tilePainter(ctx, TILESET.forest + mask), mask);
  }
}
