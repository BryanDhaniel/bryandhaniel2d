import type { BuildingId } from "@/game/map/village";
import type { PaletteName } from "@/game/palette";
import type { SpriteDef } from "./atlas";
import { ICONS, type IconName } from "./icons";
import { type Painter } from "./painter";
import { hash2 } from "./pixels";

/**
 * Buildings are painted from palette primitives plus the shared 10x10 icons for their signs.
 * Each one has a day sprite (`<id>`) and a lights overlay (`<id>-lights`) that only holds the
 * glowing windows, shown above the night tint.
 *
 * `overhang` is how far the art rises above the map footprint (chimneys, antennas).
 */
export interface BuildingArt {
  width: number;
  height: number;
  overhang: number;
}

type ArtBuildingId = Exclude<BuildingId, "mailbox">;

export const BUILDING_ART: Record<ArtBuildingId, BuildingArt> = {
  home: { width: 80, height: 76, overhang: 12 },
  workshop: { width: 80, height: 74, overhang: 10 },
  library: { width: 80, height: 88, overhang: 8 },
  ailab: { width: 80, height: 96, overhang: 16 },
  inn: { width: 80, height: 72, overhang: 8 },
};

type Mode = "day" | "lights";

interface Canvas {
  p: Painter;
  mode: Mode;
}

function day(c: Canvas, draw: (p: Painter) => void): void {
  if (c.mode === "day") {
    draw(c.p);
  }
}

function shingles(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: { base: PaletteName; dark: PaletteName; light: PaletteName },
): void {
  day(c, (p) => {
    p.rect(x, y, w, h, colors.base);
    for (let row = y + 3, course = 0; row < y + h - 1; row += 4, course += 1) {
      p.hline(x, row, w, colors.dark);
      p.hline(x, row - 2, w, colors.light);
      for (let col = x + (course % 2) * 3 + 1; col < x + w; col += 6) {
        p.vline(col, row - 2, 3, colors.dark);
      }
    }
    p.hline(x, y + 1, w, colors.light);
    p.frame(x, y, w, h, "ink");
  });
}

function planks(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  base: PaletteName,
  line: PaletteName,
): void {
  day(c, (p) => {
    p.rect(x, y, w, h, base);
    for (let col = x + 4; col < x + w; col += 5) {
      p.vline(col, y, h, line);
      if (hash2(col, y, 81) > 0.5) {
        p.px(col - 2, y + Math.floor(hash2(col, h, 82) * h), line);
      }
    }
  });
}

function bricks(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  base: PaletteName,
  mortar: PaletteName,
): void {
  day(c, (p) => {
    p.rect(x, y, w, h, base);
    for (let row = y + 3, course = 0; row < y + h; row += 4, course += 1) {
      p.hline(x, row, w, mortar);
      for (let col = x + (course % 2) * 4; col < x + w; col += 8) {
        p.vline(col, row - 3, 3, mortar);
      }
    }
  });
}

function windowPane(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  shutters?: PaletteName,
): void {
  const { p } = c;
  if (c.mode === "day") {
    if (shutters) {
      p.box(x - 3, y, 3, h, shutters, "ink");
      p.box(x + w, y, 3, h, shutters, "ink");
    }
    p.box(x, y, w, h, "sky", "ink");
    p.rect(x + 1, y + h - 3, w - 2, 2, "water");
    p.px(x + 2, y + 2, "foam");
    p.px(x + 3, y + 2, "foam");
    p.px(x + 2, y + 3, "foam");
  } else {
    p.rect(x + 1, y + 1, w - 2, h - 2, "gold");
    p.rect(x + 1, y + h - 3, w - 2, 2, "sun");
  }
  // Mullions stay dark in both layers so lit windows keep their frames.
  p.vline(x + Math.floor(w / 2), y + 1, h - 2, "ink");
  p.hline(x + 1, y + Math.floor(h / 2), w - 2, "ink");
}

function door(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: { base: PaletteName; dark: PaletteName },
): void {
  // Doors stay dark at night: the lights layer draws above characters, and a lit door
  // would paint over anyone standing on the porch.
  const { p } = c;
  if (c.mode === "day") {
    p.box(x, y, w, h, colors.base, "ink");
    for (let col = x + 3; col < x + w - 1; col += 3) {
      p.vline(col, y + 1, h - 2, colors.dark);
    }
    p.px(x + w - 3, y + Math.floor(h / 2), "gold");
    p.hline(x - 1, y + h - 1, w + 2, "stone");
  }
}

function sign(c: Canvas, x: number, y: number, icon: IconName, board: PaletteName = "wood"): void {
  day(c, (p) => {
    p.box(x, y, 14, 14, board, "ink");
    p.hline(x + 1, y + 1, 12, "sand");
    p.art(ICONS[icon], x + 2, y + 2);
  });
}

function eaveShadow(c: Canvas, x: number, y: number, w: number): void {
  day(c, (p) => {
    p.hline(x, y, w, "ink");
    p.dither(x, y + 1, w, 2, "ink");
  });
}

function groundShadow(c: Canvas, width: number, height: number): void {
  day(c, (p) => p.hline(2, height - 1, width - 4, "forest"));
}

function paintHome(c: Canvas): void {
  const { width, height } = BUILDING_ART.home;
  groundShadow(c, width, height);
  // Chimney.
  day(c, (p) => {
    p.box(56, 0, 9, 22, "brick", "ink");
    p.hline(57, 1, 7, "ember");
    for (let row = 4; row < 22; row += 4) p.hline(57, row, 7, "ink");
  });
  // Walls: plaster with timber frame.
  day(c, (p) => p.box(3, 40, 74, 35, "wheat", "ink"));
  day(c, (p) => {
    for (const col of [4, 26, 53, 75]) p.rect(col, 41, 2, 33, "wood");
    p.rect(4, 41, 72, 2, "wood");
  });
  shingles(c, 0, 10, 80, 31, { base: "ember", dark: "brick", light: "sun" });
  eaveShadow(c, 3, 41, 74);
  windowPane(c, 9, 52, 14, 11, "leaf");
  windowPane(c, 57, 52, 14, 11, "leaf");
  day(c, (p) => {
    // Flower boxes.
    for (const x0 of [8, 56]) {
      p.box(x0, 63, 16, 4, "wood", "ink");
      for (let i = 0; i < 4; i += 1) p.px(x0 + 2 + i * 4, 62, i % 2 ? "violet" : "gold");
    }
  });
  sign(c, 33, 43, "house");
  door(c, 34, 57, 12, 18, { base: "wood", dark: "bark" });
}

function paintWorkshop(c: Canvas): void {
  const { width, height } = BUILDING_ART.workshop;
  groundShadow(c, width, height);
  day(c, (p) => {
    // Stovepipe with a cap.
    p.box(63, 0, 6, 16, "stone", "ink");
    p.box(61, 0, 10, 3, "slate", "ink");
  });
  planks(c, 3, 40, 74, 33, "wood", "bark");
  day(c, (p) => p.frame(3, 40, 74, 33, "ink"));
  shingles(c, 0, 8, 80, 33, { base: "bark", dark: "ink", light: "wood" });
  day(c, (p) => {
    // Gear emblem on the roof ridge.
    p.box(31, 11, 18, 18, "sand", "ink");
    p.art(ICONS.gear, 35, 15);
  });
  eaveShadow(c, 3, 41, 74);
  windowPane(c, 9, 48, 14, 11);
  windowPane(c, 57, 48, 14, 11);
  // Wide barn door with cross bracing.
  door(c, 28, 50, 24, 23, { base: "sand", dark: "wood" });
  day(c, (p) => {
    p.vline(40, 51, 21, "ink");
    for (let i = 0; i < 10; i += 1) {
      p.px(30 + i, 52 + i * 2, "wood");
      p.px(50 - i, 52 + i * 2, "wood");
    }
  });
  day(c, (p) => {
    // Tool rack: hammer and wrench silhouettes.
    p.box(7, 62, 18, 8, "bark", "ink");
    p.rect(10, 64, 2, 5, "mist");
    p.rect(9, 63, 4, 2, "stone");
    p.rect(17, 64, 2, 5, "mist");
    p.px(16, 63, "stone");
    p.px(19, 63, "stone");
  });
}

function paintLibrary(c: Canvas): void {
  const { width, height } = BUILDING_ART.library;
  groundShadow(c, width, height);
  bricks(c, 3, 38, 74, 44, "mist", "stone");
  day(c, (p) => p.frame(3, 38, 74, 44, "ink"));
  shingles(c, 0, 4, 80, 26, { base: "slate", dark: "night", light: "stone" });
  day(c, (p) => {
    // Pediment.
    for (let row = 0; row < 12; row += 1) {
      const inset = 12 - row;
      p.hline(4 + inset * 2, 26 + row, 72 - inset * 4, row === 0 ? "ink" : "cloud");
      p.px(4 + inset * 2, 26 + row, "ink");
      p.px(75 - inset * 2, 26 + row, "ink");
    }
    p.hline(2, 38, 76, "ink");
    p.hline(2, 39, 76, "stone");
  });
  sign(c, 33, 26, "book", "cloud");
  day(c, (p) => {
    // Columns.
    for (const col of [7, 23, 51, 67]) {
      p.box(col, 41, 7, 40, "cloud", "ink");
      p.vline(col + 5, 42, 38, "mist");
      p.box(col - 1, 40, 9, 3, "mist", "ink");
    }
  });
  windowPane(c, 33, 44, 14, 10);
  windowPane(c, 14, 48, 8, 14);
  windowPane(c, 58, 48, 8, 14);
  door(c, 34, 60, 12, 22, { base: "bark", dark: "ink" });
  day(c, (p) => {
    // Steps.
    p.box(26, 82, 28, 3, "stone", "ink");
    p.box(22, 84, 36, 4, "mist", "ink");
  });
}

function paintAiLab(c: Canvas): void {
  const { width, height } = BUILDING_ART.ailab;
  groundShadow(c, width, height);
  day(c, (p) => {
    // Antenna mast and satellite dish.
    p.vline(18, 2, 20, "ink");
    p.vline(19, 2, 20, "stone");
    p.box(16, 0, 6, 3, "slate", "ink");
    p.box(50, 4, 18, 10, "mist", "ink");
    p.hline(51, 5, 16, "cloud");
    p.box(57, 12, 4, 6, "stone", "ink");
  });
  if (c.mode === "lights") {
    c.p.box(17, 0, 4, 2, "ember", "ink");
  } else {
    c.p.rect(17, 1, 4, 1, "brick");
  }
  day(c, (p) => {
    // Flat roof with a violet trim.
    p.box(0, 16, 80, 16, "night", "ink");
    p.hline(1, 17, 78, "slate");
    p.hline(1, 30, 78, "violet");
    p.box(3, 32, 74, 63, "cloud", "ink");
    for (let col = 20; col < 77; col += 19) p.vline(col, 33, 61, "mist");
    p.hline(4, 60, 72, "mist");
  });
  // Big glass front with a "neural network" on the screen.
  const { p } = c;
  if (c.mode === "day") {
    p.box(7, 37, 66, 20, "deep", "ink");
    p.dither(8, 38, 64, 18, "water");
  } else {
    p.rect(8, 38, 64, 18, "water");
    p.dither(8, 38, 64, 18, "sky");
  }
  const nodes: readonly (readonly [number, number])[] = [
    [16, 41],
    [16, 47],
    [16, 53],
    [32, 44],
    [32, 50],
    [48, 44],
    [48, 50],
    [64, 47],
  ];
  const nodeColor: PaletteName = c.mode === "day" ? "sky" : "foam";
  for (const [x, y] of nodes) {
    p.rect(x - 1, y - 1, 3, 3, c.mode === "day" ? "violet" : "gold");
    p.px(x, y, nodeColor);
  }
  sign(c, 33, 60, "chip", "night");
  if (c.mode === "day") {
    // Sliding glass doors.
    p.box(30, 75, 20, 20, "sky", "ink");
    p.vline(40, 76, 18, "ink");
    p.dither(31, 88, 18, 6, "water");
    p.px(33, 78, "foam");
    p.px(43, 78, "foam");
    p.hline(29, 95, 22, "stone");
  } else {
    // Only the upper glass glows, clear of the head of someone at the door.
    p.rect(31, 76, 9, 10, "foam");
    p.rect(41, 76, 9, 10, "foam");
    p.vline(40, 76, 10, "ink");
  }
  windowPane(c, 7, 68, 14, 12);
  windowPane(c, 59, 68, 14, 12);
}

function paintInn(c: Canvas): void {
  const { width, height } = BUILDING_ART.inn;
  groundShadow(c, width, height);
  day(c, (p) => p.box(3, 36, 74, 35, "sand", "ink"));
  day(c, (p) => {
    for (const col of [4, 24, 55, 75]) p.rect(col, 37, 2, 33, "bark");
    p.rect(4, 52, 72, 2, "bark");
  });
  shingles(c, 0, 2, 80, 35, { base: "leaf", dark: "forest", light: "grass" });
  day(c, (p) => {
    // Dormer.
    p.box(30, 8, 20, 18, "wheat", "ink");
    p.box(28, 5, 24, 5, "forest", "ink");
  });
  windowPane(c, 35, 12, 10, 11);
  eaveShadow(c, 3, 37, 74);
  windowPane(c, 9, 40, 12, 10, "brick");
  windowPane(c, 59, 40, 12, 10, "brick");
  windowPane(c, 9, 56, 12, 10, "brick");
  windowPane(c, 59, 56, 12, 10, "brick");
  door(c, 34, 52, 12, 19, { base: "wood", dark: "bark" });
  day(c, (p) => {
    // Hanging sign on a bracket.
    p.hline(46, 38, 12, "ink");
    p.vline(49, 38, 3, "ink");
    p.vline(56, 38, 3, "ink");
  });
  sign(c, 46, 41, "envelope");
  if (c.mode === "lights") {
    c.p.box(28, 44, 4, 5, "gold", "ink");
  } else {
    c.p.box(28, 44, 4, 5, "night", "ink");
  }
}

const PAINTERS: Record<ArtBuildingId, (c: Canvas) => void> = {
  home: paintHome,
  workshop: paintWorkshop,
  library: paintLibrary,
  ailab: paintAiLab,
  inn: paintInn,
};

export function buildingSprites(): SpriteDef[] {
  const defs: SpriteDef[] = [];
  for (const id of Object.keys(BUILDING_ART) as ArtBuildingId[]) {
    const art = BUILDING_ART[id];
    const paint = PAINTERS[id];
    defs.push({
      name: id,
      width: art.width,
      height: art.height,
      paint: (p) => paint({ p, mode: "day" }),
    });
    defs.push({
      name: `${id}-lights`,
      width: art.width,
      height: art.height,
      paint: (p) => paint({ p, mode: "lights" }),
    });
  }
  return defs;
}

export function isArtBuilding(id: BuildingId): id is ArtBuildingId {
  return id !== "mailbox";
}
