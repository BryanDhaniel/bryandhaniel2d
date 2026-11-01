import { PALETTE, type PaletteName } from "@/game/palette";
import type { SpriteDef } from "./atlas";
import { CAT_FRAMES } from "./characters";
import { HEART } from "./icons";
import { type Painter, circle, ellipse, paintBlob } from "./painter";
import { artSize, hash2, type PixelArt } from "./pixels";

export const LAMP_SIZE = { width: 8, height: 26 } as const;
export const GLOW_SIZE = 40;
export const FOUNTAIN_SIZE = { width: 32, height: 32 } as const;
export const FOUNTAIN_FRAMES = 3;
export const MAILBOX_SIZE = { width: 14, height: 22 } as const;
export const STALL_SIZE = { width: 32, height: 32 } as const;
export const BENCH_SIZE = { width: 16, height: 12 } as const;
export const WELL_SIZE = { width: 20, height: 28 } as const;
export const CONTACT_DIRECTIONS = 8;

function paintLamp(p: Painter): void {
  p.box(1, 22, 6, 4, "slate", "ink");
  p.box(2, 8, 4, 15, "slate", "ink");
  p.vline(3, 9, 13, "stone");
  // Lantern.
  p.hline(1, 0, 6, "ink");
  p.box(0, 1, 8, 2, "night", "ink");
  p.box(1, 3, 6, 6, "gold", "ink");
  p.px(2, 4, "cloud");
  p.vline(3, 3, 6, "ink");
}

function paintGlow(p: Painter): void {
  const c = GLOW_SIZE / 2;
  const inner = circle(c, c, 7);
  const middle = circle(c, c, 12);
  const outer = circle(c, c, 18);
  for (let y = 0; y < GLOW_SIZE; y += 1) {
    for (let x = 0; x < GLOW_SIZE; x += 1) {
      if (inner(x, y)) {
        p.px(x, y, "gold");
      } else if (middle(x, y)) {
        if ((x + y) % 2 === 0) p.px(x, y, "sun");
      } else if (outer(x, y) && x % 2 === 0 && y % 2 === 0) {
        p.px(x, y, "sun");
      }
    }
  }
}

function paintFountain(p: Painter, frame: number): void {
  paintBlob(p, ellipse(16, 24, 16, 8), {
    outline: "ink",
    base: "stone",
    light: "mist",
    shade: "slate",
  });
  paintBlob(p, ellipse(16, 23.5, 12, 5), {
    outline: "slate",
    base: "water",
    light: "sky",
    shade: "deep",
  });
  for (let i = 0; i < 3; i += 1) {
    const x = 7 + ((i * 7 + frame * 3) % 18);
    p.hline(x, 22 + (i % 2) * 2, 2, "foam");
  }
  p.box(14, 9, 4, 15, "stone", "ink");
  p.vline(15, 10, 13, "mist");
  paintBlob(p, ellipse(16, 9.5, 6, 2.5), {
    outline: "ink",
    base: "mist",
    light: "cloud",
    shade: "stone",
  });
  const drops: readonly (readonly [number, number])[][] = [
    [
      [16, 2],
      [13, 4],
      [19, 4],
      [11, 7],
      [21, 7],
    ],
    [
      [16, 1],
      [12, 5],
      [20, 5],
      [10, 9],
      [22, 9],
    ],
    [
      [16, 3],
      [14, 3],
      [18, 3],
      [12, 8],
      [20, 8],
    ],
  ];
  p.vline(16, 3, 6, "sky");
  for (const [x, y] of drops[frame] ?? []) {
    p.px(x, y, "foam");
  }
}

function paintMailbox(p: Painter): void {
  p.box(5, 11, 4, 11, "wood", "ink");
  p.vline(6, 12, 9, "sand");
  p.box(0, 3, 11, 9, "ember", "ink");
  p.hline(1, 4, 9, "sun");
  p.hline(1, 10, 9, "brick");
  p.hline(3, 7, 5, "ink");
  p.vline(11, 1, 9, "ink");
  p.box(11, 1, 3, 4, "gold", "ink");
}

interface StallStyle {
  awning: PaletteName;
  goods: readonly PaletteName[];
}

const STALLS: Record<"fruit" | "cloth", StallStyle> = {
  fruit: { awning: "ember", goods: ["ember", "gold", "lime", "sun"] },
  cloth: { awning: "violet", goods: ["violet", "sky", "sun", "cloud"] },
};

function paintStall(p: Painter, style: StallStyle): void {
  // Posts, counter and crates of goods.
  p.box(2, 8, 3, 23, "bark", "ink");
  p.box(27, 8, 3, 23, "bark", "ink");
  p.box(1, 18, 30, 11, "wood", "ink");
  p.hline(2, 19, 28, "sand");
  for (let x = 4; x < 28; x += 4) p.vline(x, 21, 7, "bark");
  for (let i = 0; i < 9; i += 1) {
    const color = style.goods[i % style.goods.length] ?? "ember";
    const x = 3 + i * 3;
    const y = 15 + (i % 2);
    p.box(x, y, 3, 3, color, "ink");
    p.px(x + 1, y, "cloud");
  }
  // Striped awning with a scalloped edge.
  for (let x = 0; x < 32; x += 1) {
    const stripe: PaletteName = Math.floor(x / 4) % 2 === 0 ? style.awning : "cloud";
    p.vline(x, 1, 7, stripe);
    if (x % 4 === 1 || x % 4 === 2) p.px(x, 8, stripe);
  }
  p.hline(0, 0, 32, "ink");
  p.hline(0, 1, 32, "ink");
  for (let x = 0; x < 32; x += 4) p.px(x, 8, "ink");
  p.hline(0, 30, 32, "ink");
}

function paintBench(p: Painter): void {
  p.box(1, 0, 14, 4, "wood", "ink");
  p.hline(2, 1, 12, "sand");
  p.box(0, 5, 16, 3, "wood", "ink");
  p.hline(1, 5, 14, "sand");
  p.box(2, 8, 2, 4, "bark", "ink");
  p.box(12, 8, 2, 4, "bark", "ink");
}

function paintWell(p: Painter): void {
  // Stone ring with dark water.
  paintBlob(p, ellipse(10, 21, 9.5, 6.5), {
    outline: "ink",
    base: "stone",
    light: "mist",
    shade: "slate",
    speckle: "slate",
    speckleDensity: 0.12,
  });
  paintBlob(p, ellipse(10, 19.5, 6, 3), {
    outline: "slate",
    base: "deep",
    light: "water",
    shade: "night",
  });
  // Roof on two posts, with a rope and bucket.
  p.box(2, 7, 2, 14, "bark", "ink");
  p.box(16, 7, 2, 14, "bark", "ink");
  for (let row = 0; row < 7; row += 1) {
    const inset = 6 - row;
    p.hline(inset, row + 1, 20 - inset * 2, row === 0 ? "ink" : row % 2 ? "brick" : "ember");
    p.px(inset, row + 1, "ink");
    p.px(19 - inset, row + 1, "ink");
  }
  p.hline(0, 8, 20, "ink");
  p.vline(10, 9, 6, "sand");
  p.box(8, 14, 5, 4, "wood", "ink");
}

function paintTreeAo(p: Painter): void {
  const shape = ellipse(12, 4, 12, 4);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 24; x += 1) {
      const inner = ellipse(12, 4, 8, 2.5)(x, y);
      if (inner || (shape(x, y) && (x + y) % 2 === 0)) p.px(x, y, "ink");
    }
  }
}

function paintBlobShadow(p: Painter, width: number, height: number): void {
  const shape = ellipse(width / 2, height / 2, width / 2, height / 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (shape(x, y)) p.px(x, y, "ink");
    }
  }
}

/** Elongated shadow pointing in one of eight directions, for lamp contact shadows. */
function paintContact(p: Painter, direction: number): void {
  const angle = (direction / CONTACT_DIRECTIONS) * Math.PI * 2;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  for (let y = 0; y < 14; y += 1) {
    for (let x = 0; x < 14; x += 1) {
      // Ground-plane coordinates: vertical distances are foreshortened in the 3/4 view.
      const px = x + 0.5 - 7;
      const py = (y + 0.5 - 7) / 0.6;
      const along = px * ux + py * uy;
      const across = -px * uy + py * ux;
      const inside =
        along >= -1 && along <= 6.5 && Math.abs(across) <= 2.2 - Math.max(0, along) * 0.15;
      if (inside && (along < 3.5 || (x + y) % 2 === 0)) p.px(x, y, "ink");
    }
  }
}

function paintSmoke(p: Painter, radius: number): void {
  const size = radius * 2 + 1;
  const shape = circle(radius, radius, radius);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!shape(x, y)) continue;
      const edge = !shape(x - 1, y) || !shape(x + 1, y) || !shape(x, y - 1) || !shape(x, y + 1);
      if (edge && (x + y) % 2 === 1) continue;
      p.px(x, y, y < radius ? "mist" : "stone");
    }
  }
}

const DUST_FRAMES: readonly PixelArt[] = [
  ["......", "..mm..", ".mwwm.", "......"],
  [".m..m.", "m.ww.m", ".m..m.", "......"],
  ["m....m", "......", "......", "m....m"],
];

const MARKER_FRAMES: readonly PixelArt[] = [
  [".YYYYYYYY.", "Y........Y", "Y..kkkk..Y", "Y........Y", ".YYYYYYYY.", ".........."],
  ["..........", "..YYYYYY..", ".Y.kkkk.Y.", "..YYYYYY..", "..........", ".........."],
];

const ZZZ: PixelArt = ["kkkkkk", "kwwwwk", "kkkwkk", "kkwkkk", "kwwwwk", "kkkkkk"];
const FIREFLY: PixelArt = [".O.", "OYO", ".O."];
const SPARKS: readonly PixelArt[] = [["Y"], ["OY", "YO"]];
const RAIN: PixelArt = ["f", "f", "m", "m"];
const SPLASHES: readonly PixelArt[] = [
  ["..f..", ".f.f."],
  [".f.f.", "f...f"],
  ["f...f", "....."],
];

function artSprite(name: string, art: PixelArt, flipX = false): SpriteDef {
  const { width, height } = artSize(art);
  return { name, width, height, paint: (p) => p.art(art, 0, 0, { flipX }) };
}

export function propSprites(): SpriteDef[] {
  const defs: SpriteDef[] = [];
  for (let frame = 0; frame < FOUNTAIN_FRAMES; frame += 1) {
    defs.push({
      name: `fountain/${frame}`,
      ...FOUNTAIN_SIZE,
      paint: (p) => paintFountain(p, frame),
    });
  }
  defs.push({ name: "lamp", ...LAMP_SIZE, paint: paintLamp });
  defs.push({ name: "glow", width: GLOW_SIZE, height: GLOW_SIZE, paint: paintGlow });
  defs.push({ name: "mailbox", ...MAILBOX_SIZE, paint: paintMailbox });
  defs.push({ name: "stall/fruit", ...STALL_SIZE, paint: (p) => paintStall(p, STALLS.fruit) });
  defs.push({ name: "stall/cloth", ...STALL_SIZE, paint: (p) => paintStall(p, STALLS.cloth) });
  defs.push({ name: "bench", ...BENCH_SIZE, paint: paintBench });
  defs.push({ name: "well", ...WELL_SIZE, paint: paintWell });
  defs.push({ name: "ao/tree", width: 24, height: 8, paint: paintTreeAo });
  defs.push({ name: "blob/0", width: 10, height: 3, paint: (p) => paintBlobShadow(p, 10, 3) });
  defs.push({ name: "blob/1", width: 12, height: 4, paint: (p) => paintBlobShadow(p, 12, 4) });
  defs.push({ name: "blob/2", width: 14, height: 4, paint: (p) => paintBlobShadow(p, 14, 4) });
  for (let direction = 0; direction < CONTACT_DIRECTIONS; direction += 1) {
    defs.push({
      name: `contact/${direction}`,
      width: 14,
      height: 14,
      paint: (p) => paintContact(p, direction),
    });
  }
  [1, 2, 3].forEach((radius, i) => {
    defs.push({
      name: `smoke/${i}`,
      width: radius * 2 + 1,
      height: radius * 2 + 1,
      paint: (p) => paintSmoke(p, radius),
    });
  });
  DUST_FRAMES.forEach((art, i) => defs.push(artSprite(`dust/${i}`, art)));
  MARKER_FRAMES.forEach((art, i) => defs.push(artSprite(`marker/${i}`, art)));
  SPARKS.forEach((art, i) => defs.push(artSprite(`spark/${i}`, art)));
  SPLASHES.forEach((art, i) => defs.push(artSprite(`splash/${i}`, art)));
  defs.push(artSprite("rain", RAIN));
  defs.push(artSprite("heart", HEART));
  defs.push(artSprite("zzz", ZZZ));
  defs.push(artSprite("firefly", FIREFLY));
  return defs;
}

export const CAT_FRAME_NAMES = ["walk0", "walk1", "sit", "sleep"] as const;

export function catSprites(): SpriteDef[] {
  return CAT_FRAME_NAMES.map((frame) => artSprite(`cat/${frame}`, CAT_FRAMES[frame]));
}

/** A seamless 64x32 dithered fog texture. */
export function paintFog(ctx: CanvasRenderingContext2D): void {
  const width = 64;
  const height = 32;
  ctx.clearRect(0, 0, width, height);
  const blobs = Array.from({ length: 9 }, (_, i) => ({
    x: hash2(i, 1, 61) * width,
    y: hash2(i, 2, 61) * height,
    r: 6 + hash2(i, 3, 61) * 10,
  }));
  const density = (x: number, y: number) => {
    let d = 0;
    for (const blob of blobs) {
      for (const ox of [-width, 0, width]) {
        for (const oy of [-height, 0, height]) {
          const dist = Math.hypot(x - blob.x - ox, (y - blob.y - oy) * 1.8);
          d = Math.max(d, 1 - dist / blob.r);
        }
      }
    }
    return d;
  };
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  ctx.fillStyle = PALETTE.mist;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const threshold = ((bayer[(y % 4) * 4 + (x % 4)] ?? 0) + 0.5) / 16;
      if (density(x, y) > threshold) ctx.fillRect(x, y, 1, 1);
    }
  }
}

export const FOG_SIZE = { width: 64, height: 32 } as const;
