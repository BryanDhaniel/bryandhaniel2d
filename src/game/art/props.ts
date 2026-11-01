import type { SpriteDef } from "./atlas";
import { CAT_FRAMES, SHADOW } from "./characters";
import { HEART } from "./icons";
import { type Painter, circle, ellipse, paintBlob, shifted, union } from "./painter";
import { artSize, type PixelArt } from "./pixels";

export const TREE_SIZE = { width: 32, height: 40 } as const;
export const TREE_SWAY_FRAMES = 3;
export const LAMP_SIZE = { width: 8, height: 26 } as const;
export const GLOW_SIZE = 40;
export const FOUNTAIN_SIZE = { width: 32, height: 32 } as const;
export const FOUNTAIN_FRAMES = 3;
export const MAILBOX_SIZE = { width: 14, height: 22 } as const;

const canopyShape = union(
  circle(16, 12, 10),
  circle(8, 17, 7),
  circle(24, 17, 7),
  circle(16, 20, 8),
);

function paintTree(p: Painter, sway: number): void {
  // Ground shadow and roots.
  p.hline(9, 39, 14, "forest");
  p.hline(7, 38, 18, "forest");
  p.box(13, 26, 6, 13, "bark", "ink");
  p.vline(14, 27, 11, "wood");
  p.px(12, 38, "ink");
  p.px(19, 38, "ink");
  paintBlob(p, shifted(canopyShape, sway, 0), {
    outline: "ink",
    base: "leaf",
    light: "grass",
    shade: "forest",
    speckle: "lime",
    speckleDensity: 0.06,
    seed: 5,
  });
  // A few apples for colour.
  p.px(10 + sway, 16, "ember");
  p.px(21 + sway, 12, "ember");
  p.px(18 + sway, 22, "ember");
}

function paintLamp(p: Painter): void {
  p.hline(1, 25, 6, "leaf");
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
  // Basin.
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
  // Pillar and top bowl.
  p.box(14, 9, 4, 15, "stone", "ink");
  p.vline(15, 10, 13, "mist");
  paintBlob(p, ellipse(16, 9.5, 6, 2.5), {
    outline: "ink",
    base: "mist",
    light: "cloud",
    shade: "stone",
  });
  // Spray.
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
  p.hline(2, 21, 10, "leaf");
  p.box(5, 11, 4, 11, "wood", "ink");
  p.vline(6, 12, 9, "sand");
  p.box(0, 3, 11, 9, "ember", "ink");
  p.hline(1, 4, 9, "sun");
  p.hline(1, 10, 9, "brick");
  p.hline(3, 7, 5, "ink");
  // Flag.
  p.vline(11, 1, 9, "ink");
  p.box(11, 1, 3, 4, "gold", "ink");
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

function artSprite(name: string, art: PixelArt, flipX = false): SpriteDef {
  const { width, height } = artSize(art);
  return { name, width, height, paint: (p) => p.art(art, 0, 0, { flipX }) };
}

export function propSprites(): SpriteDef[] {
  const defs: SpriteDef[] = [];
  for (let frame = 0; frame < TREE_SWAY_FRAMES; frame += 1) {
    defs.push({ name: `tree/${frame}`, ...TREE_SIZE, paint: (p) => paintTree(p, frame - 1) });
  }
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
  DUST_FRAMES.forEach((art, i) => defs.push(artSprite(`dust/${i}`, art)));
  MARKER_FRAMES.forEach((art, i) => defs.push(artSprite(`marker/${i}`, art)));
  defs.push(artSprite("shadow", SHADOW));
  defs.push(artSprite("heart", HEART));
  defs.push(artSprite("zzz", ZZZ));
  defs.push(artSprite("firefly", FIREFLY));
  return defs;
}

export const CAT_FRAME_NAMES = ["walk0", "walk1", "sit", "sleep"] as const;

export function catSprites(): SpriteDef[] {
  return CAT_FRAME_NAMES.map((frame) => artSprite(`cat/${frame}`, CAT_FRAMES[frame]));
}
