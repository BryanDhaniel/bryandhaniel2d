import type { LightKind } from "@/game/config/visuals";
import type { BuildingId } from "@/game/map/village";
import type { PaletteName } from "@/game/palette";
import type { SpriteDef } from "./atlas";
import { ICONS, type IconName } from "./icons";
import { circle, ellipse, paintBlob, type Painter } from "./painter";
import { hash2, type PixelArt } from "./pixels";

/**
 * Buildings are layered so characters can walk behind them and roofs can fade:
 *
 * - `<id>/base`   interior (seen when the roof fades), front walls, door, windows, props.
 *                 Collides, and is y-sorted by the building's front edge.
 * - `<id>/roof`   roof, chimney, awnings and roof-mounted gear. Same sort key, drawn above
 *                 the base, and faded to ~30% while the player is at the door or behind it.
 * - `<id>/lights` only the glowing pixels (windows, lanterns, neon), drawn unlit at night.
 *
 * Animated details (gears, dish, screens, LEDs, the inn sign) are separate `part/*` frames.
 * All coordinates in this file are art-local: (0, 0) is the top-left of the sprite, whose
 * bottom edge sits on the map footprint's bottom edge and whose left edge is `padX` pixels
 * left of the footprint.
 */

export type ArtBuildingId = Exclude<BuildingId, "mailbox">;

export interface ArtRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LightAnchor {
  x: number;
  y: number;
  kind: LightKind;
}

export interface PartSpec {
  /** Frame prefix in the buildings atlas: frames are `<name>/0`, `<name>/1`, ... */
  name: string;
  frames: number;
  frameRate: number;
  x: number;
  y: number;
  /** Mounted on the roof, so it fades with it. */
  onRoof: boolean;
  /** Screens and LEDs: drawn unlit so they glow in the dark. */
  emissive: boolean;
  yoyo: boolean;
}

export interface BuildingSpec {
  width: number;
  height: number;
  padX: number;
  overhang: number;
  /** Region the roof covers; the interior is painted under it on the base layer. */
  roof: ArtRect;
  /** Solid areas outside the map footprint (sheds, forges, cabinets). */
  solids: ArtRect[];
  lights: LightAnchor[];
  parts: PartSpec[];
  smoke: { x: number; y: number }[];
  sparks: { x: number; y: number } | null;
}

function part(
  name: string,
  frames: number,
  frameRate: number,
  x: number,
  y: number,
  options: { onRoof?: boolean; emissive?: boolean; yoyo?: boolean } = {},
): PartSpec {
  return {
    name,
    frames,
    frameRate,
    x,
    y,
    onRoof: options.onRoof ?? false,
    emissive: options.emissive ?? false,
    yoyo: options.yoyo ?? false,
  };
}

export const PART_SIZES: Record<string, { width: number; height: number; frames: number }> = {
  "part/gear": { width: 16, height: 16, frames: 4 },
  "part/dish": { width: 20, height: 20, frames: 8 },
  "part/screen": { width: 60, height: 18, frames: 4 },
  "part/leds": { width: 5, height: 14, frames: 4 },
  "part/beacon": { width: 3, height: 3, frames: 2 },
  "part/sign": { width: 14, height: 16, frames: 3 },
};

export const BUILDING_SPECS: Record<ArtBuildingId, BuildingSpec> = {
  home: {
    width: 88,
    height: 80,
    padX: 4,
    overhang: 16,
    roof: { x: 0, y: 8, width: 88, height: 46 },
    solids: [],
    lights: [
      { x: 20, y: 62, kind: "window" },
      { x: 69, y: 62, kind: "window" },
      { x: 34, y: 64, kind: "lantern" },
    ],
    parts: [],
    smoke: [{ x: 66, y: 0 }],
    sparks: null,
  },
  workshop: {
    width: 100,
    height: 78,
    padX: 10,
    overhang: 14,
    roof: { x: 4, y: 6, width: 92, height: 45 },
    solids: [
      { x: 0, y: 66, width: 12, height: 12 },
      { x: 89, y: 62, width: 11, height: 16 },
    ],
    lights: [
      { x: 24, y: 59, kind: "window" },
      { x: 75, y: 59, kind: "window" },
      { x: 36, y: 59, kind: "lantern" },
      { x: 64, y: 59, kind: "lantern" },
      { x: 6, y: 69, kind: "forge" },
    ],
    parts: [part("part/gear", 4, 6, 42, 15, { onRoof: true })],
    smoke: [{ x: 74, y: 0 }],
    sparks: { x: 6, y: 67 },
  },
  library: {
    width: 88,
    height: 104,
    padX: 4,
    overhang: 24,
    roof: { x: 0, y: 24, width: 88, height: 34 },
    solids: [],
    lights: [
      { x: 22, y: 76, kind: "window" },
      { x: 65, y: 76, kind: "window" },
      { x: 43, y: 66, kind: "window" },
      { x: 35, y: 78, kind: "lantern" },
      { x: 51, y: 78, kind: "lantern" },
    ],
    parts: [],
    smoke: [],
    sparks: null,
  },
  ailab: {
    width: 92,
    height: 104,
    padX: 6,
    overhang: 24,
    roof: { x: 2, y: 20, width: 88, height: 17 },
    solids: [{ x: 83, y: 80, width: 9, height: 24 }],
    lights: [
      { x: 46, y: 52, kind: "monitor" },
      { x: 46, y: 37, kind: "neon" },
      { x: 19, y: 75, kind: "window" },
      { x: 72, y: 75, kind: "window" },
      { x: 60, y: 1, kind: "beacon" },
    ],
    parts: [
      part("part/screen", 4, 3, 16, 43, { emissive: true }),
      part("part/leds", 4, 5, 85, 82, { emissive: true }),
      part("part/dish", 8, 5, 66, 0, { onRoof: true }),
      part("part/beacon", 2, 1.4, 59, 0, { onRoof: true, emissive: true }),
    ],
    smoke: [],
    sparks: null,
  },
  inn: {
    width: 92,
    height: 88,
    padX: 6,
    overhang: 24,
    roof: { x: 0, y: 6, width: 92, height: 38 },
    solids: [],
    lights: [
      { x: 21, y: 51, kind: "window" },
      { x: 46, y: 51, kind: "window" },
      { x: 71, y: 51, kind: "window" },
      { x: 20, y: 72, kind: "window" },
      { x: 77, y: 72, kind: "window" },
      { x: 37, y: 70, kind: "lantern" },
      { x: 54, y: 70, kind: "lantern" },
    ],
    parts: [part("part/sign", 3, 2.2, 58, 64, { yoyo: true })],
    smoke: [{ x: 79, y: 0 }],
    sparks: null,
  },
};

// ---------------------------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------------------------

type Layer = "base" | "roof" | "lights";

interface Canvas {
  p: Painter;
  layer: Layer;
}

function on(c: Canvas, layer: Layer, draw: (p: Painter) => void): void {
  if (c.layer === layer) {
    draw(c.p);
  }
}

interface ShingleColors {
  base: PaletteName;
  dark: PaletteName;
  light: PaletteName;
}

/** Shingled roof; `inset(row)` narrows the top rows to shape the silhouette. */
function shingleRoof(
  p: Painter,
  rect: ArtRect,
  colors: ShingleColors,
  inset: (row: number) => number,
): void {
  for (let row = 0; row < rect.height; row += 1) {
    const i = inset(row);
    const y = rect.y + row;
    const x0 = rect.x + i;
    const w = rect.width - i * 2;
    const course = Math.floor(row / 4);
    const inCourse = row % 4;
    p.hline(x0, y, w, inCourse === 0 ? colors.light : inCourse === 3 ? colors.dark : colors.base);
    if (inCourse > 0 && inCourse < 3) {
      for (let x = x0 + ((course % 2) * 3 + 1); x < x0 + w; x += 6) {
        p.px(x, y, colors.dark);
      }
    }
    p.px(x0, y, "ink");
    p.px(x0 + w - 1, y, "ink");
  }
  p.hline(rect.x + inset(0), rect.y, rect.width - inset(0) * 2, "ink");
  p.hline(rect.x, rect.y + rect.height - 1, rect.width, "ink");
  p.hline(rect.x + 1, rect.y + rect.height - 2, rect.width - 2, colors.dark);
}

function plankWall(p: Painter, rect: ArtRect, base: PaletteName, seam: PaletteName): void {
  p.rect(rect.x, rect.y, rect.width, rect.height, base);
  for (let x = rect.x + 4; x < rect.x + rect.width; x += 5) {
    p.vline(x, rect.y, rect.height, seam);
    const knot = rect.y + Math.floor(hash2(x, rect.y, 81) * rect.height);
    p.px(x - 2, knot, seam);
  }
  p.frame(rect.x, rect.y, rect.width, rect.height, "ink");
}

function brickWall(p: Painter, rect: ArtRect, base: PaletteName, mortar: PaletteName): void {
  p.rect(rect.x, rect.y, rect.width, rect.height, base);
  for (let y = rect.y + 3, course = 0; y < rect.y + rect.height; y += 4, course += 1) {
    p.hline(rect.x, y, rect.width, mortar);
    for (let x = rect.x + (course % 2) * 4; x < rect.x + rect.width; x += 8) {
      p.vline(x, y - 3, 3, mortar);
    }
  }
  p.frame(rect.x, rect.y, rect.width, rect.height, "ink");
}

function foundation(p: Painter, x: number, y: number, width: number): void {
  p.box(x, y, width, 4, "stone", "ink");
  for (let i = x + 3; i < x + width - 1; i += 5) {
    p.vline(i, y + 1, 2, "slate");
  }
  p.hline(x + 1, y + 1, width - 2, "mist");
}

/** Interior floor with low side and back walls, seen from above when the roof fades. */
function interior(
  p: Painter,
  rect: ArtRect,
  floor: PaletteName,
  line: PaletteName,
  wall: PaletteName,
): void {
  p.rect(rect.x, rect.y, rect.width, rect.height, floor);
  for (let y = rect.y + 3; y < rect.y + rect.height; y += 4) {
    p.hline(rect.x, y, rect.width, line);
  }
  p.box(rect.x - 2, rect.y - 3, rect.width + 4, 3, wall, "ink");
  p.box(rect.x - 2, rect.y - 1, 2, rect.height + 1, wall, "ink");
  p.box(rect.x + rect.width, rect.y - 1, 2, rect.height + 1, wall, "ink");
}

interface WindowStyle {
  shutters?: PaletteName;
  lit: PaletteName;
  glow: PaletteName;
  glass?: PaletteName;
}

function windowPane(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  style: WindowStyle,
): void {
  const { p } = c;
  if (c.layer === "base") {
    if (style.shutters) {
      p.box(x - 3, y, 3, h, style.shutters, "ink");
      p.box(x + w, y, 3, h, style.shutters, "ink");
    }
    p.box(x, y, w, h, style.glass ?? "sky", "ink");
    p.rect(x + 1, y + h - 3, w - 2, 2, "water");
    p.px(x + 2, y + 2, "foam");
    p.px(x + 3, y + 2, "foam");
    p.px(x + 2, y + 3, "foam");
    p.hline(x - 1, y + h, w + 2, "stone");
  } else if (c.layer === "lights") {
    p.rect(x + 1, y + 1, w - 2, h - 2, style.lit);
    p.rect(x + 1, y + h - 3, w - 2, 2, style.glow);
  } else {
    return;
  }
  // Mullions stay dark in both layers so lit windows keep their frames.
  p.vline(x + Math.floor(w / 2), y + 1, h - 2, "ink");
  p.hline(x + 1, y + Math.floor(h / 2), w - 2, "ink");
}

function door(
  p: Painter,
  x: number,
  y: number,
  w: number,
  h: number,
  base: PaletteName,
  dark: PaletteName,
): void {
  p.box(x, y, w, h, base, "ink");
  for (let col = x + 3; col < x + w - 1; col += 3) {
    p.vline(col, y + 1, h - 2, dark);
  }
  p.px(x + w - 3, y + Math.floor(h / 2), "gold");
}

function sign(p: Painter, x: number, y: number, icon: IconName, board: PaletteName = "wood"): void {
  p.box(x, y, 14, 14, board, "ink");
  p.hline(x + 1, y + 1, 12, board === "night" ? "slate" : "sand");
  p.art(ICONS[icon], x + 2, y + 2);
}

function lantern(c: Canvas, x: number, y: number): void {
  on(c, "base", (p) => {
    p.hline(x - 1, y - 1, 5, "ink");
    p.box(x, y, 3, 5, "wheat", "ink");
    p.px(x + 1, y + 5, "ink");
  });
  on(c, "lights", (p) => {
    p.rect(x, y + 1, 3, 3, "gold");
    p.px(x + 1, y + 2, "cloud");
  });
}

function barrel(p: Painter, x: number, y: number): void {
  p.box(x, y, 7, 8, "wood", "ink");
  p.hline(x + 1, y + 2, 5, "bark");
  p.hline(x + 1, y + 5, 5, "bark");
  p.vline(x + 2, y + 1, 6, "sand");
}

function crate(p: Painter, x: number, y: number, size: number): void {
  p.box(x, y, size, size, "sand", "ink");
  p.frame(x + 1, y + 1, size - 2, size - 2, "wood");
  for (let i = 1; i < size - 1; i += 1) {
    p.px(x + i, y + i, "wood");
  }
}

function flowerBox(p: Painter, x: number, y: number, width: number): void {
  p.box(x, y, width, 4, "wood", "ink");
  for (let i = 0; i * 4 + 2 < width; i += 1) {
    p.px(x + 2 + i * 4, y - 1, i % 2 ? "violet" : "gold");
    p.px(x + 3 + i * 4, y - 1, "leaf");
  }
}

function bookshelf(p: Painter, x: number, y: number, width: number): void {
  p.box(x, y, width, 6, "bark", "ink");
  const spines: readonly PaletteName[] = ["violet", "ember", "water", "leaf", "gold", "sky"];
  for (let i = 1; i < width - 1; i += 1) {
    const color = spines[Math.floor(hash2(i, x + y, 31) * spines.length)] ?? "ember";
    p.vline(x + i, y + 1, 4, color);
  }
}

// ---------------------------------------------------------------------------------------------
// Home: a timber-framed cottage with a chimney, shutters and flower boxes.
// ---------------------------------------------------------------------------------------------

function paintHome(c: Canvas): void {
  const spec = BUILDING_SPECS.home;
  on(c, "base", (p) => {
    interior(p, { x: 7, y: 21, width: 74, height: 30 }, "sand", "wood", "wheat");
    // Bed, rug, table and a hearth.
    p.box(10, 24, 14, 13, "bark", "ink");
    p.rect(11, 25, 12, 4, "cloud");
    p.rect(11, 29, 12, 7, "water");
    p.hline(11, 32, 12, "deep");
    p.box(30, 39, 26, 10, "ember", "ink");
    p.frame(31, 40, 24, 8, "gold");
    p.box(38, 25, 13, 8, "wood", "ink");
    p.hline(39, 26, 11, "sand");
    p.px(42, 28, "cloud");
    p.box(34, 27, 3, 4, "bark", "ink");
    p.box(52, 27, 3, 4, "bark", "ink");
    p.box(62, 21, 15, 7, "brick", "ink");
    p.rect(66, 24, 7, 3, "night");
    p.px(68, 25, "ember");
    p.px(69, 24, "sun");
    p.px(70, 25, "gold");
    bookshelf(p, 61, 41, 16);
    // Front wall: plaster between timber posts.
    p.box(7, 50, 74, 27, "wheat", "ink");
    for (const x of [8, 27, 59, 78]) p.rect(x, 51, 2, 25, "wood");
    p.rect(8, 51, 72, 2, "wood");
    foundation(p, 6, 76, 76);
  });
  windowPane(c, 13, 57, 14, 11, { shutters: "leaf", lit: "gold", glow: "sun" });
  windowPane(c, 62, 57, 14, 11, { shutters: "leaf", lit: "gold", glow: "sun" });
  on(c, "base", (p) => {
    flowerBox(p, 12, 69, 16);
    flowerBox(p, 61, 69, 16);
    // Little shingled canopy over the door.
    p.box(35, 55, 18, 4, "brick", "ink");
    p.hline(36, 56, 16, "ember");
    door(p, 38, 60, 12, 17, "wood", "bark");
    p.box(36, 77, 16, 3, "stone", "ink");
    // Potted plant and a log pile.
    p.box(28, 74, 4, 5, "brick", "ink");
    paintBlob(p, circle(30, 71, 3), {
      outline: "ink",
      base: "leaf",
      light: "lime",
      shade: "forest",
    });
    for (const [lx, ly] of [
      [54, 75],
      [58, 75],
      [56, 72],
    ] as const) {
      p.box(lx, ly, 4, 4, "wood", "ink");
      p.px(lx + 1, ly + 1, "sand");
    }
  });
  lantern(c, 33, 62);
  on(c, "roof", (p) => {
    shingleRoof(p, spec.roof, { base: "ember", dark: "brick", light: "sun" }, (row) =>
      Math.max(0, Math.round((14 - row) * 0.5)),
    );
    // Chimney.
    p.box(62, 2, 9, 20, "brick", "ink");
    p.hline(63, 3, 7, "ember");
    for (let y = 6; y < 22; y += 4) p.hline(63, y, 7, "ink");
    p.box(61, 0, 11, 3, "stone", "ink");
  });
}

// ---------------------------------------------------------------------------------------------
// Workshop: plank barn with a roof gear, striped awning, forge and a lean-to of crates.
// ---------------------------------------------------------------------------------------------

function paintWorkshop(c: Canvas): void {
  const spec = BUILDING_SPECS.workshop;
  on(c, "base", (p) => {
    interior(p, { x: 13, y: 19, width: 74, height: 30 }, "stone", "slate", "wood");
    p.dither(13, 19, 74, 30, "mist");
    // Workbench with tools, an anvil and stacked crates.
    p.box(16, 21, 32, 6, "wood", "ink");
    p.hline(17, 22, 30, "sand");
    p.hline(20, 23, 6, "mist");
    p.rect(30, 23, 3, 2, "slate");
    p.box(56, 31, 11, 6, "slate", "ink");
    p.hline(57, 32, 9, "mist");
    crate(p, 70, 21, 8);
    crate(p, 78, 25, 7);
    paintBlob(p, circle(27, 39, 3), {
      outline: "ink",
      base: "stone",
      light: "mist",
      shade: "slate",
    });
    plankWall(p, { x: 13, y: 48, width: 74, height: 27 }, "wood", "bark");
    foundation(p, 12, 74, 76);
    // Barn door with cross bracing.
    door(p, 39, 53, 22, 21, "sand", "wood");
    p.vline(50, 54, 19, "ink");
    for (let i = 0; i < 10; i += 1) {
      p.px(41 + i, 55 + i * 2, "wood");
      p.px(59 - i, 55 + i * 2, "wood");
    }
    // Forge: brick hearth with a fire mouth.
    p.box(0, 62, 12, 16, "brick", "ink");
    p.hline(1, 63, 10, "ember");
    p.box(2, 66, 8, 5, "night", "ink");
    p.px(4, 69, "ember");
    p.px(6, 68, "sun");
    p.px(7, 69, "ember");
    // Crates and a barrel under the lean-to.
    crate(p, 89, 66, 8);
    crate(p, 91, 70, 8);
    barrel(p, 89, 70);
  });
  windowPane(c, 18, 55, 14, 10, { lit: "gold", glow: "sun" });
  windowPane(c, 69, 55, 14, 10, { lit: "gold", glow: "sun" });
  lantern(c, 35, 57);
  lantern(c, 63, 57);
  on(c, "lights", (p) => {
    p.rect(3, 67, 6, 3, "sun");
    p.px(5, 68, "gold");
    p.px(6, 67, "cloud");
  });
  on(c, "roof", (p) => {
    // Plank roof with a lighter ridge.
    const roof = spec.roof;
    for (let row = 0; row < roof.height; row += 1) {
      const inset = Math.max(0, Math.round((10 - row) * 0.6));
      const x0 = roof.x + inset;
      const w = roof.width - inset * 2;
      p.hline(x0, roof.y + row, w, row % 5 === 0 ? "wood" : "bark");
      for (let x = x0 + 3 + (row % 2); x < x0 + w; x += 7) p.px(x, roof.y + row, "ink");
      p.px(x0, roof.y + row, "ink");
      p.px(x0 + w - 1, roof.y + row, "ink");
    }
    p.hline(roof.x + 6, roof.y, roof.width - 12, "ink");
    p.hline(roof.x, roof.y + roof.height - 1, roof.width, "ink");
    // Plate behind the spinning gear.
    p.box(40, 13, 20, 20, "sand", "ink");
    p.frame(41, 14, 18, 18, "wood");
    // Stovepipe.
    p.box(72, 2, 6, 14, "stone", "ink");
    p.vline(73, 3, 12, "mist");
    p.box(70, 0, 10, 3, "slate", "ink");
    // Striped awning over the door.
    for (let x = 35; x < 66; x += 1) {
      const stripe: PaletteName = Math.floor((x - 35) / 4) % 2 === 0 ? "sun" : "cloud";
      p.vline(x, 47, 6, stripe);
      if ((x - 35) % 4 === 1) p.px(x, 53, stripe);
    }
    p.hline(35, 46, 31, "ink");
    p.hline(35, 52, 31, "brick");
    // Lean-to roof over the crates.
    for (let row = 0; row < 7; row += 1) {
      p.hline(86, 54 + row, 14, row % 3 === 0 ? "sand" : "wood");
    }
    p.frame(86, 54, 14, 7, "ink");
  });
}

// ---------------------------------------------------------------------------------------------
// Library: brick hall with columns, a pediment and a clock tower.
// ---------------------------------------------------------------------------------------------

function paintLibrary(c: Canvas): void {
  const spec = BUILDING_SPECS.library;
  on(c, "base", (p) => {
    interior(p, { x: 7, y: 28, width: 74, height: 29 }, "wheat", "sand", "mist");
    for (let y = 28; y < 57; y += 2) {
      for (let x = 7 + (y % 4 === 0 ? 0 : 2); x < 81; x += 4) p.px(x, y, "sand");
    }
    bookshelf(p, 10, 30, 68);
    bookshelf(p, 10, 41, 30);
    bookshelf(p, 48, 41, 30);
    p.box(34, 50, 20, 5, "wood", "ink");
    p.hline(35, 51, 18, "sand");
    paintBlob(p, circle(72, 52, 2), { outline: "ink", base: "water", light: "sky", shade: "deep" });
    p.px(72, 51, "leaf");
    brickWall(p, { x: 7, y: 56, width: 74, height: 40 }, "mist", "stone");
  });
  windowPane(c, 19, 64, 7, 22, { lit: "gold", glow: "sun" });
  windowPane(c, 62, 64, 7, 22, { lit: "gold", glow: "sun" });
  windowPane(c, 38, 62, 12, 8, { lit: "gold", glow: "sun" });
  on(c, "base", (p) => {
    // Columns with capitals and bases.
    for (const x of [11, 27, 54, 70]) {
      p.box(x, 58, 7, 36, "cloud", "ink");
      p.vline(x + 5, 59, 34, "mist");
      p.box(x - 1, 56, 9, 3, "mist", "ink");
      p.box(x - 1, 93, 9, 3, "mist", "ink");
    }
    door(p, 38, 72, 12, 23, "bark", "ink");
    p.hline(39, 72, 10, "wood");
    // Steps.
    p.box(24, 95, 40, 4, "stone", "ink");
    p.hline(25, 96, 38, "mist");
    p.box(20, 98, 48, 6, "mist", "ink");
    p.hline(21, 99, 46, "cloud");
  });
  lantern(c, 34, 76);
  lantern(c, 50, 76);
  on(c, "roof", (p) => {
    shingleRoof(p, spec.roof, { base: "slate", dark: "night", light: "stone" }, (row) =>
      Math.max(0, Math.round((12 - row) * 0.7)),
    );
    // Pediment with a book medallion.
    for (let row = 0; row < 13; row += 1) {
      const inset = 12 - row;
      const x0 = 6 + inset * 3;
      const w = 76 - inset * 6;
      p.hline(x0, 45 + row, w, row === 0 ? "ink" : "cloud");
      p.px(x0, 45 + row, "ink");
      p.px(x0 + w - 1, 45 + row, "ink");
    }
    p.hline(4, 57, 80, "ink");
    paintBlob(p, circle(43.5, 51.5, 6), {
      outline: "ink",
      base: "violet",
      light: "sky",
      shade: "night",
    });
    p.art(ICONS.book, 39, 47);
    // Clock tower with a spire.
    p.box(34, 8, 20, 22, "mist", "ink");
    for (let y = 11; y < 30; y += 4) p.hline(35, y, 18, "stone");
    paintBlob(p, circle(43.5, 18.5, 5), {
      outline: "ink",
      base: "cloud",
      light: "cloud",
      shade: "mist",
    });
    p.vline(43, 15, 4, "ink");
    p.hline(44, 18, 3, "ink");
    for (let row = 0; row < 9; row += 1) {
      const w = 2 + row * 3;
      p.hline(44 - Math.floor(w / 2), row, w, row === 0 ? "gold" : "slate");
      p.px(44 - Math.floor(w / 2), row, "ink");
      p.px(44 - Math.floor(w / 2) + w - 1, row, "ink");
    }
  });
  on(c, "lights", (p) => {
    // The clock face glows at night.
    p.rect(41, 16, 6, 6, "wheat");
    p.vline(43, 15, 4, "ink");
    p.hline(44, 18, 3, "ink");
  });
}

// ---------------------------------------------------------------------------------------------
// AI Lab: glass-and-panel lab with a monitor wall, rooftop dish, solar panels and a server
// cabinet with blinking LEDs.
// ---------------------------------------------------------------------------------------------

function paintAiLab(c: Canvas): void {
  const spec = BUILDING_SPECS.ailab;
  on(c, "base", (p) => {
    interior(p, { x: 9, y: 25, width: 74, height: 12 }, "slate", "night", "mist");
    for (const x of [12, 30]) {
      p.box(x, 26, 15, 8, "night", "ink");
      for (let i = 0; i < 5; i += 1) p.px(x + 2 + i * 3, 28, i % 2 ? "lime" : "sky");
    }
    p.box(56, 27, 24, 6, "mist", "ink");
    p.rect(60, 28, 6, 3, "sky");
    p.rect(70, 28, 6, 3, "sky");
    // Panelled walls with a violet trim.
    p.box(9, 36, 74, 66, "cloud", "ink");
    for (const x of [27, 45, 63]) p.vline(x, 37, 64, "mist");
    p.hline(10, 66, 72, "mist");
    p.hline(10, 38, 72, "violet");
    // Monitor wall bezel (the animated screen sits inside it).
    p.box(14, 41, 64, 22, "night", "ink");
    sign(p, 39, 64, "chip", "night");
    // Sliding glass doors.
    p.box(36, 79, 21, 22, "sky", "ink");
    p.vline(46, 80, 20, "ink");
    p.dither(37, 92, 19, 8, "water");
    p.px(39, 82, "foam");
    p.px(49, 82, "foam");
    p.box(34, 101, 25, 3, "stone", "ink");
    // Server cabinet outside.
    p.box(83, 78, 9, 24, "night", "ink");
    for (let y = 97; y < 101; y += 2) p.hline(84, y, 7, "slate");
  });
  windowPane(c, 13, 70, 14, 11, { lit: "foam", glow: "sky" });
  windowPane(c, 66, 70, 14, 11, { lit: "foam", glow: "sky" });
  on(c, "lights", (p) => {
    p.rect(37, 80, 9, 8, "foam");
    p.rect(47, 80, 9, 8, "foam");
  });
  on(c, "roof", (p) => {
    const roof = spec.roof;
    p.box(roof.x, roof.y, roof.width, roof.height, "night", "ink");
    p.hline(roof.x + 1, roof.y + 1, roof.width - 2, "slate");
    p.hline(roof.x + 1, roof.y + roof.height - 2, roof.width - 2, "violet");
    // Solar panels.
    p.box(8, 22, 33, 11, "deep", "ink");
    for (let x = 16; x < 41; x += 8) p.vline(x, 23, 9, "sky");
    p.hline(9, 27, 31, "sky");
    // HVAC unit.
    p.box(44, 23, 11, 9, "mist", "ink");
    paintBlob(p, circle(49, 27, 3), {
      outline: "ink",
      base: "stone",
      light: "mist",
      shade: "slate",
    });
    // Antenna mast and dish mount.
    p.vline(60, 2, 20, "ink");
    p.vline(61, 2, 20, "stone");
    p.box(72, 18, 8, 6, "slate", "ink");
  });
  on(c, "lights", (p) => {
    p.hline(spec.roof.x + 1, spec.roof.y + spec.roof.height - 2, spec.roof.width - 2, "violet");
    p.hline(10, 38, 72, "violet");
  });
}

// ---------------------------------------------------------------------------------------------
// Inn: two-storey timber inn with dormers, a chimney, lanterns and a swinging sign.
// ---------------------------------------------------------------------------------------------

function paintInn(c: Canvas): void {
  const spec = BUILDING_SPECS.inn;
  on(c, "base", (p) => {
    interior(p, { x: 9, y: 29, width: 74, height: 14 }, "wood", "bark", "sand");
    p.box(12, 31, 32, 5, "bark", "ink");
    p.hline(13, 32, 30, "wood");
    for (let x = 16; x < 42; x += 6) p.px(x, 33, x % 12 === 4 ? "gold" : "cloud");
    for (const x of [58, 72]) {
      paintBlob(p, circle(x, 36, 3.5), {
        outline: "ink",
        base: "wood",
        light: "sand",
        shade: "bark",
      });
      p.px(x, 35, "cloud");
    }
    // Plaster walls with timber framing; the middle beam marks the upper floor.
    p.box(9, 42, 74, 44, "sand", "ink");
    for (const x of [10, 31, 61, 81]) p.rect(x, 43, 2, 42, "bark");
    p.rect(10, 43, 72, 2, "bark");
    p.rect(10, 62, 72, 2, "bark");
  });
  for (const x of [15, 40, 65]) {
    windowPane(c, x, 46, 13, 10, { shutters: "brick", lit: "gold", glow: "sun" });
  }
  windowPane(c, 14, 67, 13, 10, { shutters: "brick", lit: "gold", glow: "sun" });
  windowPane(c, 72, 67, 10, 10, { lit: "gold", glow: "sun" });
  on(c, "base", (p) => {
    door(p, 40, 67, 12, 18, "wood", "bark");
    p.box(38, 85, 16, 3, "stone", "ink");
    // Bracket for the hanging sign.
    p.hline(56, 63, 16, "ink");
    p.px(56, 64, "ink");
    barrel(p, 12, 78);
    barrel(p, 20, 79);
  });
  lantern(c, 36, 68);
  lantern(c, 53, 68);
  on(c, "roof", (p) => {
    shingleRoof(p, spec.roof, { base: "leaf", dark: "forest", light: "grass" }, (row) =>
      Math.max(0, Math.round((12 - row) * 0.7)),
    );
    for (const x of [22, 58]) {
      p.box(x, 18, 13, 12, "wheat", "ink");
      p.box(x + 4, 21, 5, 7, "bark", "ink");
      for (let row = 0; row < 6; row += 1) {
        p.hline(x - 1 + row, 12 + row, 15 - row * 2, row === 0 ? "ink" : "forest");
      }
    }
    p.box(76, 2, 8, 16, "brick", "ink");
    p.hline(77, 3, 6, "ember");
    p.box(75, 0, 10, 3, "stone", "ink");
  });
}

const PAINTERS: Record<ArtBuildingId, (c: Canvas) => void> = {
  home: paintHome,
  workshop: paintWorkshop,
  library: paintLibrary,
  ailab: paintAiLab,
  inn: paintInn,
};

// ---------------------------------------------------------------------------------------------
// Animated parts
// ---------------------------------------------------------------------------------------------

function paintGear(p: Painter, frame: number): void {
  const rotation = (frame / 4) * (Math.PI / 4);
  const cx = 7.5;
  const cy = 7.5;
  const mask = (x: number, y: number) => {
    const dx = x - cx;
    const dy = y - cy;
    const r = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx) + rotation;
    const tooth = Math.cos(angle * 8) > 0.25 ? 1.6 : 0;
    return r <= 5.2 + tooth && r >= 1.6;
  };
  paintBlob(p, mask, { outline: "ink", base: "stone", light: "mist", shade: "slate" });
  p.px(7, 7, "gold");
  p.px(8, 8, "gold");
}

function paintDish(p: Painter, frame: number): void {
  const angle = (frame / 8) * Math.PI * 2;
  const facing = Math.cos(angle);
  const rx = Math.max(1.2, Math.abs(facing) * 8.5);
  p.box(9, 12, 3, 8, "slate", "ink");
  paintBlob(p, ellipse(10.5, 8, rx, 6.5), {
    outline: "ink",
    base: facing > 0 ? "cloud" : "mist",
    light: "cloud",
    shade: facing > 0 ? "mist" : "stone",
  });
  const feed = Math.round(10 + Math.sin(angle) * 3);
  p.px(feed, 8, "gold");
  p.px(feed, 7, "ink");
}

function paintScreen(p: Painter, frame: number): void {
  p.rect(0, 0, 60, 18, "deep");
  p.dither(0, 0, 60, 18, "night", frame % 2);
  const columns = [8, 22, 36];
  const rows = [3, 9, 14];
  for (let ci = 0; ci < columns.length - 1; ci += 1) {
    for (const ya of rows) {
      for (const yb of rows) {
        const xa = columns[ci] ?? 0;
        const xb = columns[ci + 1] ?? 0;
        const steps = xb - xa;
        for (let s = 1; s < steps; s += 2) {
          const t = s / steps;
          p.px(Math.round(xa + (xb - xa) * t), Math.round(ya + (yb - ya) * t), "water");
        }
      }
    }
  }
  columns.forEach((x, ci) => {
    rows.forEach((y, ri) => {
      const active = (ci + ri + frame) % 4 === 0;
      p.rect(x - 1, y - 1, 3, 3, active ? "foam" : "sky");
      p.px(x, y, active ? "cloud" : "foam");
    });
  });
  // A little bar chart that ticks along.
  for (let i = 0; i < 6; i += 1) {
    const h = 2 + Math.floor(hash2(i, frame, 77) * 11);
    p.rect(44 + i * 2, 16 - h, 1, h, i % 2 ? "lime" : "gold");
  }
  p.hline(43, 16, 14, "foam");
}

function paintLeds(p: Painter, frame: number): void {
  const colors: readonly PaletteName[] = ["lime", "gold", "ember", "sky"];
  for (let row = 0; row < 7; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const lit = hash2(row * 2 + col, frame, 13) > 0.4;
      const color = colors[(row + col) % colors.length] ?? "lime";
      p.px(col * 3 + 1, row * 2, lit ? color : "slate");
    }
  }
}

function paintBeacon(p: Painter, frame: number): void {
  if (frame === 0) {
    p.px(1, 0, "ember");
    p.px(0, 1, "ember");
    p.px(2, 1, "ember");
    p.px(1, 2, "ember");
    p.px(1, 1, "gold");
  } else {
    p.px(1, 1, "brick");
  }
}

/** Draws pixel art with a per-row horizontal offset (used to swing the inn sign). */
function drawSheared(
  p: Painter,
  art: PixelArt,
  x: number,
  y: number,
  offset: (row: number) => number,
): void {
  art.forEach((line, row) => {
    p.art([line], x + offset(row), y + row);
  });
}

function paintSign(p: Painter, frame: number): void {
  const swing = frame - 1;
  const offset = (row: number) => Math.round((swing * row) / 12);
  p.vline(3, 0, 2, "ink");
  p.vline(10, 0, 2, "ink");
  const board: string[] = [];
  for (let row = 0; row < 14; row += 1) {
    if (row === 0 || row === 13) {
      board.push("kkkkkkkkkkkkkk");
    } else if (row === 1) {
      board.push("kddddddddddddk");
    } else {
      board.push("koooooooooooo".padEnd(13, "o") + "k");
    }
  }
  drawSheared(p, board, 0, 2, offset);
  drawSheared(p, ICONS.envelope, 2, 4, (row) => offset(row + 2));
}

const PART_PAINTERS: Record<string, (p: Painter, frame: number) => void> = {
  "part/gear": paintGear,
  "part/dish": paintDish,
  "part/screen": paintScreen,
  "part/leds": paintLeds,
  "part/beacon": paintBeacon,
  "part/sign": paintSign,
};

export function buildingSprites(): SpriteDef[] {
  const defs: SpriteDef[] = [];
  for (const id of Object.keys(BUILDING_SPECS) as ArtBuildingId[]) {
    const spec = BUILDING_SPECS[id];
    const paint = PAINTERS[id];
    for (const layer of ["base", "roof", "lights"] as const) {
      defs.push({
        name: `${id}/${layer}`,
        width: spec.width,
        height: spec.height,
        paint: (p) => paint({ p, layer }),
      });
    }
  }
  for (const [name, size] of Object.entries(PART_SIZES)) {
    const painter = PART_PAINTERS[name];
    if (!painter) continue;
    for (let frame = 0; frame < size.frames; frame += 1) {
      defs.push({
        name: `${name}/${frame}`,
        width: size.width,
        height: size.height,
        paint: (p) => painter(p, frame),
      });
    }
  }
  return defs;
}

export function isArtBuilding(id: string): id is ArtBuildingId {
  return Object.prototype.hasOwnProperty.call(BUILDING_SPECS, id);
}
