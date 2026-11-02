import { PALETTE, type PaletteName } from "@/game/palette";
import { CHARACTER } from "@/game3d/config/character";

/**
 * The player sprite as pixel data. Frames are composed from compact part arrays (head, torso,
 * hem, arms, legs, fringe tips) stamped at per-frame offsets, so the breathing bob, the walk
 * cycle and the wave share one drawing. Pure TypeScript (no DOM, no three.js): the game, the
 * atlas export script, the contact sheet and the portrait all build from it.
 *
 * Legend (every ink is a palette name except skin, which comes from config/character.ts):
 *   .  transparent        X outline          L lit-side outline (upper left)
 *   1-4 hair ramp, dark → sheen              5-8 skin ramp, shadow → highlight
 *   a-d hoodie ramp, dark → light            p q trousers (dark, light)
 *   s shoe   o sole line   w drawstrings / catchlight   v laptop sticker
 *   h n portrait background bands
 */

export type Direction = "down" | "left" | "right" | "up";
export const DIRECTIONS: readonly Direction[] = ["down", "left", "right", "up"];

export type Animation = "idle" | "walk" | "interact";
export const ANIMATIONS: readonly Animation[] = ["idle", "walk", "interact"];
export const FRAME_COUNTS: Readonly<Record<Animation, number>> = { idle: 2, walk: 6, interact: 2 };
/** Walk frames where a foot lands (the fringe bounces and a footstep plays). */
export const FOOTFALL_FRAMES: readonly number[] = [0, 3];

export const FRAME_WIDTH = CHARACTER.frame.width;
export const FRAME_HEIGHT = CHARACTER.frame.height;
export const TRANSPARENT = ".";

export type Ink = { palette: PaletteName } | { skin: 0 | 1 | 2 | 3 };

export const LEGEND: Readonly<Record<string, Ink>> = {
  X: { palette: CHARACTER.outline },
  L: { palette: CHARACTER.litOutline },
  "1": { palette: CHARACTER.hair[0] },
  "2": { palette: CHARACTER.hair[1] },
  "3": { palette: CHARACTER.hair[2] },
  "4": { palette: CHARACTER.hair[3] },
  "5": { skin: 0 },
  "6": { skin: 1 },
  "7": { skin: 2 },
  "8": { skin: 3 },
  a: { palette: CHARACTER.hoodie[0] },
  b: { palette: CHARACTER.hoodie[1] },
  c: { palette: CHARACTER.hoodie[2] },
  d: { palette: CHARACTER.hoodie[3] },
  p: { palette: CHARACTER.trousers[0] },
  q: { palette: CHARACTER.trousers[1] },
  s: { palette: CHARACTER.shoe },
  o: { palette: CHARACTER.sole },
  w: { palette: CHARACTER.accent },
  v: { palette: CHARACTER.sticker },
  h: { palette: CHARACTER.portraitBackground[0] },
  n: { palette: CHARACTER.portraitBackground[1] },
};

/** Hex colour of a legend character, or null for transparency. */
export function inkHex(char: string): string | null {
  if (char === TRANSPARENT) return null;
  const ink = LEGEND[char];
  if (!ink) {
    throw new Error(`Unknown player ink "${char}".`);
  }
  return "palette" in ink ? PALETTE[ink.palette] : CHARACTER.skin[ink.skin];
}

/**
 * Parts, all lit from the upper left. Heads are 12 px wide and stamped at x = 2, front and
 * back torsos and hems 10 px at x = 3. The side view faces right; left is its mirror image.
 */
export const PARTS = {
  // Two-block cut from the front: a full textured top block with a cool sheen, a one-pixel
  // step in to the short dark sides above the ears, and a fringe parted by a gap of skin.
  headDown: [
    "...LLLXXX...",
    ".LL444332XX.",
    "L3444333221X",
    "L3323222121X",
    ".X12383211X.",
    ".X68177175X.",
    "..X787776X..",
    "...X6765X...",
  ],
  // From behind: the same top block, then the short back block over the neck.
  headUp: [
    "...LLLXXX...",
    ".LL444332XX.",
    "L3444333221X",
    "L3333222211X",
    ".X12222211X.",
    ".X61121115X.",
    "..X212211X..",
    "...X5665X...",
  ],
  // Profile facing right: the fringe over the brow, the ear set in the short dark side.
  headSide: [
    "...LLLXXX...",
    ".LL444332XX.",
    "L3444333221X",
    "L3332222121X",
    ".X121232128X",
    ".X211628717X",
    "..X11567776X",
    "...X156665X.",
  ],
  // A strand that drops over the forehead gap on footfall (stamped at head row 4).
  fringeDown: ["2"],
  fringeSide: ["1"],

  // Hoodie front: the hood bunched round the neck, two drawstrings, the kangaroo pocket seam.
  torsoDown: ["LdcaaaabbX", "LdcwbbwbaX", "LdcwcbwbaX", "LcaaaaaabX"],
  // Back: the hood lying on the upper back above its dark lower edge.
  torsoUp: ["LddccbbbaX", "LdcddccbaX", "LcbaaaabaX", "LcccbbbbaX"],
  // Side: the hood bunch behind the neck, a drawstring at the front.
  torsoSide: ["LddcbbaX", "LdcbbbwX", "LcbbbbwX", "LcbbbaaX"],
  // Ribbed hems (sway a pixel either way while walking).
  hemFront: ["XcbcbcbcbX"],
  hemSide: ["XcbcbcbX"],

  // Front arms; the lit arm carries the sticker on the front of the sleeve.
  armLeft: ["Ld", "Lv", "Lc", "X8"],
  armLeftBack: ["Ld", "Ld", "Lc", "X8"],
  armRight: ["bX", "aX", "bX", "6X"],
  armWave: [".8X", ".7X", "LcX", "LbX", "cbX", "baX"],
  // Side arm poses (shoulder at x 6-8 in every pose).
  armSideMid: ["Ldc", "Lvc", "Ldc", "X8X"],
  armSideForward: ["Ldc.", ".Lvc", ".Ldc", ".X8X"],
  armSideBack: [".Ldc", "Lvc.", "Ldc.", "X8X."],
  // Raised forward, the forearm up and the hand in front of the face (drawn over the head).
  armSideWave: ["......X8X", "......X7X", "......LcX", ".....LdbX", "..LddcbX.", "LdcbbX..."],

  // Legs: charcoal trousers, dark sneakers with a light sole line.
  legLeft: ["LqpX", "LssX", "XooX"],
  legRight: ["XppX", "XssX", "XooX"],
  legSideNear: ["LqpX.", "LsssX", "XoooX"],
  legSideFar: ["XppX.", "XsssX", "XoooX"],
} as const satisfies Record<string, readonly string[]>;

export type PartName = keyof typeof PARTS;

interface Stamp {
  part: PartName;
  x: number;
  y: number;
}

type View = "down" | "up" | "side";

/**
 * Leg lifts (left, right) per front/back walk frame: both feet are down on the two contacts,
 * and the back foot lifts a pixel while it passes.
 */
const FRONT_LEGS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, -1],
  [0, -1],
  [0, 0],
  [-1, 0],
  [-1, 0],
];
/** Arm swing (left, right; +1 = hand forward and lower), opposite to the legs. */
const FRONT_ARMS: readonly (readonly [number, number])[] = [
  [-1, 1],
  [0, 0],
  [1, -1],
  [1, -1],
  [0, 0],
  [-1, 1],
];
const HEM_SWAY: readonly number[] = [0, 1, 1, 0, -1, -1];
/** Side stride: (dx, dy) of the near and far leg per walk frame. */
const SIDE_STRIDE: readonly (readonly [readonly [number, number], readonly [number, number]])[] = [
  [
    [2, 0],
    [-2, 0],
  ],
  [
    [1, 0],
    [-1, -1],
  ],
  [
    [0, 0],
    [0, -1],
  ],
  [
    [-2, 0],
    [2, 0],
  ],
  [
    [-1, -1],
    [1, 0],
  ],
  [
    [0, -1],
    [0, 0],
  ],
];
const SIDE_ARM: readonly PartName[] = [
  "armSideBack",
  "armSideBack",
  "armSideMid",
  "armSideForward",
  "armSideForward",
  "armSideMid",
];

function recipe(view: View, animation: Animation, index: number): Stamp[] {
  const walking = animation === "walk";
  const step = walking ? index % 6 : 0;
  // The upper body drops a pixel on footfalls and on the out-breath.
  const bob =
    animation === "idle"
      ? index % 2 === 1
        ? 1
        : 0
      : walking && FOOTFALL_FRAMES.includes(step)
        ? 1
        : 0;
  const bounce = walking && FOOTFALL_FRAMES.includes(step);
  const nod = animation === "interact" ? index % 2 : 0;
  const hem = walking ? (HEM_SWAY[step] ?? 0) : 0;
  const stamps: Stamp[] = [];
  if (view === "side") {
    const stride = walking ? SIDE_STRIDE[step] : undefined;
    const nearOffset = stride?.[0] ?? [0, 0];
    const farOffset = stride?.[1] ?? [0, 0];
    stamps.push({ part: "legSideFar", x: 5 + farOffset[0], y: 13 + farOffset[1] });
    stamps.push({ part: "legSideNear", x: 5 + nearOffset[0], y: 13 + nearOffset[1] });
    stamps.push({ part: "torsoSide", x: 4, y: 8 + bob });
    stamps.push({ part: "hemSide", x: 4 + hem, y: 12 + bob });
    if (animation !== "interact") {
      const pose = walking ? (SIDE_ARM[step] ?? "armSideMid") : "armSideMid";
      stamps.push({ part: pose, x: pose === "armSideBack" ? 5 : 6, y: 9 + bob });
    }
    stamps.push({ part: "headSide", x: 2, y: bob + nod });
    if (bounce) stamps.push({ part: "fringeSide", x: 12, y: 4 + bob });
    // The raised near arm passes in front of the face; the second frame lifts the hand.
    if (animation === "interact") stamps.push({ part: "armSideWave", x: 6, y: 4 + bob - nod });
    return stamps;
  }
  const legs = walking ? (FRONT_LEGS[step] ?? [0, 0]) : [0, 0];
  const arms = walking ? (FRONT_ARMS[step] ?? [0, 0]) : [0, 0];
  stamps.push({ part: "legLeft", x: 4, y: 13 + (legs[0] ?? 0) });
  stamps.push({ part: "legRight", x: 8, y: 13 + (legs[1] ?? 0) });
  stamps.push({ part: view === "down" ? "torsoDown" : "torsoUp", x: 3, y: 8 + bob });
  stamps.push({ part: "hemFront", x: 3 + hem, y: 12 + bob });
  stamps.push({
    part: view === "down" ? "armLeft" : "armLeftBack",
    x: 2,
    y: 9 + bob + (arms[0] ?? 0),
  });
  if (animation === "interact") {
    stamps.push({ part: "armWave", x: 12 + nod, y: 4 + bob });
  } else {
    stamps.push({ part: "armRight", x: 12, y: 9 + bob + (arms[1] ?? 0) });
  }
  stamps.push({ part: view === "down" ? "headDown" : "headUp", x: 2, y: bob + nod });
  if (bounce && view === "down") stamps.push({ part: "fringeDown", x: 7, y: 4 + bob });
  return stamps;
}

function stamp(canvas: string[][], part: readonly string[], x: number, y: number): void {
  part.forEach((row, dy) => {
    const line = canvas[y + dy];
    if (!line) return;
    for (let dx = 0; dx < row.length; dx += 1) {
      const char = row.charAt(dx);
      const column = x + dx;
      if (char !== TRANSPARENT && column >= 0 && column < line.length) line[column] = char;
    }
  });
}

/** Mirrors a frame left to right. */
export function mirror(rows: readonly string[]): string[] {
  return rows.map((row) => [...row].reverse().join(""));
}

/** One frame as FRAME_HEIGHT rows of FRAME_WIDTH legend characters. */
export function playerFrame(direction: Direction, animation: Animation, index: number): string[] {
  const view: View = direction === "down" ? "down" : direction === "up" ? "up" : "side";
  const canvas = Array.from({ length: FRAME_HEIGHT }, () =>
    Array<string>(FRAME_WIDTH).fill(TRANSPARENT),
  );
  for (const entry of recipe(view, animation, index)) {
    stamp(canvas, PARTS[entry.part], entry.x, entry.y);
  }
  const rows = canvas.map((line) => line.join(""));
  return direction === "left" ? mirror(rows) : rows;
}

/** Writes a grid of legend characters into RGBA pixels (row-major, top row first). */
export function gridToRgba(
  rows: readonly string[],
  out: Uint8ClampedArray,
  stride: number,
  originX = 0,
  originY = 0,
): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const hex = inkHex(row.charAt(x));
      if (!hex) continue;
      const value = Number.parseInt(hex.slice(1), 16);
      const i = ((originY + y) * stride + originX + x) * 4;
      out[i] = (value >> 16) & 255;
      out[i + 1] = (value >> 8) & 255;
      out[i + 2] = value & 255;
      out[i + 3] = 255;
    }
  });
}

export const PORTRAIT_SIZE = 64;

/**
 * The 64x64 portrait for the About panel and the HUD: head and shoulders of the front idle
 * frame scaled 5x (the same pixels), on a two-band background, with catchlights in the eyes
 * and a small mouth that the in-world sprite leaves out.
 */
export function portraitGrid(): string[] {
  const source = playerFrame("down", "idle", 0);
  const scale = 5;
  const crop = { x: 2, y: 0, width: 12, height: 12 };
  const origin = {
    x: (PORTRAIT_SIZE - crop.width * scale) / 2,
    y: PORTRAIT_SIZE - crop.height * scale,
  };
  const [top, bottom] = ["h", "n"];
  const grid = Array.from({ length: PORTRAIT_SIZE }, (_, y) =>
    Array<string>(PORTRAIT_SIZE).fill(y < PORTRAIT_SIZE * 0.6 ? (top ?? "h") : (bottom ?? "n")),
  );
  const paint = (x: number, y: number, width: number, height: number, char: string) => {
    for (let dy = 0; dy < height; dy += 1) {
      const line = grid[y + dy];
      if (!line) continue;
      for (let dx = 0; dx < width; dx += 1) {
        if (x + dx >= 0 && x + dx < PORTRAIT_SIZE) line[x + dx] = char;
      }
    }
  };
  const at = (sourceX: number, sourceY: number) => ({
    x: origin.x + (sourceX - crop.x) * scale,
    y: origin.y + (sourceY - crop.y) * scale,
  });
  for (let y = 0; y < crop.height; y += 1) {
    const row = source[crop.y + y] ?? "";
    for (let x = 0; x < crop.width; x += 1) {
      const char = row.charAt(crop.x + x);
      if (char === TRANSPARENT) continue;
      const point = at(crop.x + x, crop.y + y);
      paint(point.x, point.y, scale, scale, char);
    }
  }
  // Catchlights in the top-left corner of each eye, and a small mouth centred below them.
  const skin = "5678";
  const eyes: { x: number; y: number }[] = [];
  source.forEach((row, y) => {
    for (let x = 1; x < row.length - 1; x += 1) {
      // An eye is a dark pixel with skin on both sides.
      const isEye =
        row.charAt(x) === "1" &&
        skin.includes(row.charAt(x - 1)) &&
        skin.includes(row.charAt(x + 1));
      if (isEye) eyes.push(at(x, y));
    }
  });
  for (const eye of eyes) paint(eye.x, eye.y, 2, 2, "w");
  const [left, right] = eyes;
  if (left && right) {
    const centre = (left.x + right.x + scale) / 2;
    paint(Math.round(centre - 2), left.y + 2 * scale - 1, 4, 1, "5");
  }
  return grid.map((line) => line.join(""));
}
