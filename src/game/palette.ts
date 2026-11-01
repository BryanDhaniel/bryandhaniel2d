/**
 * The single 24-colour palette used by every sprite, tile, UI surface and text colour.
 *
 * - Game art references colours through the one-character PIXEL_KEYS below.
 * - The HTML UI reads the same values through CSS variables (`--c-<name>`) that the root
 *   layout injects from `paletteCssVariables()`, and Tailwind maps them to `bg-ink`,
 *   `text-cloud`, etc. in globals.css.
 *
 * Change a hex value here and it changes everywhere.
 */
export const PALETTE = {
  ink: "#16141f",
  night: "#2a2540",
  slate: "#45466b",
  stone: "#7a7d9c",
  mist: "#b8bccf",
  cloud: "#f4f1e8",
  bark: "#4b2e2b",
  wood: "#855035",
  sand: "#c9955f",
  wheat: "#ecd3a0",
  forest: "#1e4536",
  leaf: "#2e7246",
  grass: "#58a14b",
  lime: "#a4d65e",
  deep: "#1b3a6e",
  water: "#2d6fb5",
  sky: "#62b6ea",
  foam: "#c2ecf5",
  brick: "#8c2f3d",
  ember: "#d9573b",
  sun: "#f0a23b",
  gold: "#f8de6a",
  skin: "#ecbc9a",
  violet: "#8b5cc9",
} as const;

export type PaletteName = keyof typeof PALETTE;

export const PALETTE_NAMES = Object.keys(PALETTE) as PaletteName[];

/** One character per colour, used by the compact pixel-data strings. `.` is transparent. */
export const PIXEL_KEYS = {
  k: "ink",
  n: "night",
  s: "slate",
  g: "stone",
  m: "mist",
  w: "cloud",
  b: "bark",
  o: "wood",
  d: "sand",
  h: "wheat",
  F: "forest",
  l: "leaf",
  G: "grass",
  L: "lime",
  D: "deep",
  u: "water",
  y: "sky",
  f: "foam",
  r: "brick",
  e: "ember",
  O: "sun",
  Y: "gold",
  p: "skin",
  v: "violet",
} as const satisfies Record<string, PaletteName>;

export type PixelKey = keyof typeof PIXEL_KEYS;

export const TRANSPARENT = ".";

export function hex(name: PaletteName): string {
  return PALETTE[name];
}

/** Palette colour as a 0xRRGGBB number, the format Phaser expects for tints and fills. */
export function int(name: PaletteName): number {
  return Number.parseInt(PALETTE[name].slice(1), 16);
}

export function isPixelKey(char: string): char is PixelKey {
  return Object.prototype.hasOwnProperty.call(PIXEL_KEYS, char);
}

export function paletteCssVariables(): string {
  const declarations = PALETTE_NAMES.map((name) => `--c-${name}:${PALETTE[name]};`).join("");
  return `:root{${declarations}}`;
}
