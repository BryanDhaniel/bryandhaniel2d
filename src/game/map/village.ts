import type { SectionId } from "@/content/portfolio";

/**
 * The village layout. One character per 16x16 tile; see LEGEND below.
 * Building letters must form solid rectangles: the rectangle is the building footprint and
 * the bottom-centre tile is its door. `buildTiledMap()` turns this into Tiled-style JSON.
 */
export const VILLAGE_ROWS: readonly string[] = [
  "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
  "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
  "TTT........TTT...p.....TT..h.....T...TTT",
  "TT..HHHHH.fffff.t.......h......WWWWW..TT",
  "TT..HHHHH.f***f.............rr.WWWWW..TT",
  "TT..HHHHH.f***f...........t.r..WWWWW..TT",
  "TT..HHHHH.fffff................WWWWW..TT",
  "TT.##################################.TT",
  "TT.##################################.TT",
  "TT...........l.##########.l...........TT",
  "TT...t.**.w....#SoooooSo#.........t...TT",
  "TTb........t...#oooooooo#..p..........TT",
  "TT..LLLLL..rr..#oooFFooo#......AAAAA..TT",
  "TT..LLLLL..~~..#oooFFooo#......AAAAA..TT",
  "TT..LLLLL..~~..#onoooono#......AAAAAb.TT",
  "TT..LLLLL..~~..#oovPoooo#......AAAAA..TT",
  "TT.qLLLLLq.~~l.##########.l...qAAAAAq.TT",
  "TT.########==########################.TT",
  "TT.########==########################.TT",
  "TT.........~~..##........c....**......TT",
  "TT.........~~..##IIIIIq.t.............TT",
  "TT.~~~~~~~~~~..##IIIII.....~~~~~~~~...TT",
  "TT.~~~~~~~~....##IIIII.....~~~~~~~~~..TT",
  "TT.~~~~~~~~...l##IIIIIm....~~~~~~~~~~.TT",
  "TT.~~~~~~~.....##########..~~~~~~~~~~.TT",
  "TT..~~~~~..r...##########...~~~~~~~~..TT",
  "TT....~~....h.......k.......~~~~~~.p..TT",
  "TTT.......TT................TT.......TTT",
  "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
  "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
];

export const TILE_SIZE = 16;

export type Ground = "grass" | "flowers" | "path" | "cobble" | "bridge" | "water";
export type Obstacle = "forest" | "fence" | "bush" | "rock" | "planter";
export type PropKind = "tree" | "lamp" | "stall" | "bench" | "well";
export type TreeVariant = "oak" | "pine" | "birch";
export type NpcKind = "cat" | "villager" | "elder";
export type BuildingId = "home" | "workshop" | "library" | "ailab" | "inn" | "mailbox";

interface LegendEntry {
  ground: Ground;
  obstacle?: Obstacle;
  prop?: PropKind;
  variant?: TreeVariant;
  building?: BuildingId;
  fountain?: true;
  spawn?: "player" | NpcKind;
}

export const LEGEND: Readonly<Record<string, LegendEntry>> = {
  ".": { ground: "grass" },
  "*": { ground: "flowers" },
  "#": { ground: "path" },
  o: { ground: "cobble" },
  "=": { ground: "bridge" },
  "~": { ground: "water" },
  T: { ground: "grass", obstacle: "forest" },
  f: { ground: "grass", obstacle: "fence" },
  b: { ground: "grass", obstacle: "bush" },
  r: { ground: "grass", obstacle: "rock" },
  q: { ground: "grass", obstacle: "planter" },
  t: { ground: "grass", prop: "tree", variant: "oak" },
  p: { ground: "grass", prop: "tree", variant: "pine" },
  h: { ground: "grass", prop: "tree", variant: "birch" },
  l: { ground: "grass", prop: "lamp" },
  w: { ground: "grass", prop: "well" },
  S: { ground: "cobble", prop: "stall" },
  n: { ground: "cobble", prop: "bench" },
  H: { ground: "grass", building: "home" },
  W: { ground: "grass", building: "workshop" },
  L: { ground: "grass", building: "library" },
  A: { ground: "grass", building: "ailab" },
  I: { ground: "grass", building: "inn" },
  m: { ground: "grass", building: "mailbox" },
  F: { ground: "cobble", fountain: true },
  P: { ground: "cobble", spawn: "player" },
  v: { ground: "cobble", spawn: "villager" },
  k: { ground: "grass", spawn: "elder" },
  c: { ground: "grass", spawn: "cat" },
};

/** Footprint of each prop in tiles (props are anchored at their top-left tile). */
export const PROP_TILES: Readonly<Record<PropKind, { width: number; height: number }>> = {
  tree: { width: 1, height: 1 },
  lamp: { width: 1, height: 1 },
  stall: { width: 2, height: 1 },
  bench: { width: 1, height: 1 },
  well: { width: 1, height: 1 },
};

export interface BuildingInfo {
  label: string;
  section: SectionId;
}

/** Which portfolio section each building opens. */
export const BUILDINGS: Readonly<Record<BuildingId, BuildingInfo>> = {
  home: { label: "Home", section: "about" },
  workshop: { label: "Workshop", section: "projects" },
  library: { label: "Library", section: "education" },
  ailab: { label: "AI Lab", section: "skills" },
  inn: { label: "Inn", section: "contact" },
  mailbox: { label: "Mailbox", section: "contact" },
};

export interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Named regions for the HUD location label (tile coordinates). The first match wins, so
 * small areas are listed before the roads they sit on.
 */
export const AREAS: readonly { name: string; rect: TileRect }[] = [
  { name: "Old Bridge", rect: { x: 10, y: 16, width: 4, height: 4 } },
  { name: "Village Square", rect: { x: 15, y: 9, width: 10, height: 8 } },
  { name: "Garden", rect: { x: 9, y: 2, width: 7, height: 5 } },
  { name: "North Road", rect: { x: 2, y: 7, width: 36, height: 2 } },
  { name: "South Road", rect: { x: 2, y: 17, width: 36, height: 2 } },
  { name: "Inn Lane", rect: { x: 14, y: 19, width: 12, height: 8 } },
  { name: "Willow Pond", rect: { x: 2, y: 19, width: 12, height: 9 } },
  { name: "Lakeside", rect: { x: 26, y: 19, width: 12, height: 9 } },
];

export const DEFAULT_AREA_NAME = "Kiznaiver's Village";

export interface ParsedBuilding {
  id: BuildingId;
  rect: TileRect;
  door: { x: number; y: number };
}

export interface ParsedProp {
  kind: PropKind;
  x: number;
  y: number;
  variant?: TreeVariant;
}

export interface ParsedVillage {
  width: number;
  height: number;
  ground: Ground[];
  obstacles: (Obstacle | null)[];
  buildings: ParsedBuilding[];
  fountain: TileRect | null;
  props: ParsedProp[];
  spawns: { kind: "player" | NpcKind; x: number; y: number }[];
}

function legendFor(char: string, x: number, y: number): LegendEntry {
  const entry = LEGEND[char];
  if (!entry) {
    throw new Error(`Unknown map character "${char}" at ${x},${y}.`);
  }
  return entry;
}

function boundingRect(points: { x: number; y: number }[]): TileRect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x + 1, height: Math.max(...ys) - y + 1 };
}

export function parseVillage(rows: readonly string[] = VILLAGE_ROWS): ParsedVillage {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  if (width === 0) {
    throw new Error("Village map is empty.");
  }

  const ground: Ground[] = [];
  const obstacles: (Obstacle | null)[] = [];
  const props: ParsedProp[] = [];
  const spawns: ParsedVillage["spawns"] = [];
  const buildingCells = new Map<BuildingId, { x: number; y: number }[]>();
  const fountainCells: { x: number; y: number }[] = [];

  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`Map row ${y} is ${row.length} tiles wide, expected ${width}.`);
    }
    for (let x = 0; x < width; x += 1) {
      const entry = legendFor(row.charAt(x), x, y);
      ground.push(entry.ground);
      obstacles.push(entry.obstacle ?? null);
      if (entry.prop) {
        props.push(
          entry.variant
            ? { kind: entry.prop, x, y, variant: entry.variant }
            : { kind: entry.prop, x, y },
        );
      }
      if (entry.spawn) {
        spawns.push({ kind: entry.spawn, x, y });
      }
      if (entry.fountain) {
        fountainCells.push({ x, y });
      }
      if (entry.building) {
        const cells = buildingCells.get(entry.building) ?? [];
        cells.push({ x, y });
        buildingCells.set(entry.building, cells);
      }
    }
  });

  const buildings: ParsedBuilding[] = [];
  buildingCells.forEach((cells, id) => {
    const rect = boundingRect(cells);
    if (cells.length !== rect.width * rect.height) {
      throw new Error(`Building "${id}" is not a solid rectangle.`);
    }
    buildings.push({
      id,
      rect,
      door: { x: rect.x + Math.floor(rect.width / 2), y: rect.y + rect.height - 1 },
    });
  });

  let fountain: TileRect | null = null;
  if (fountainCells.length > 0) {
    fountain = boundingRect(fountainCells);
    if (fountainCells.length !== fountain.width * fountain.height) {
      throw new Error("The fountain is not a solid rectangle.");
    }
  }

  if (!spawns.some((spawn) => spawn.kind === "player")) {
    throw new Error("The map has no player spawn (P).");
  }

  return { width, height, ground, obstacles, buildings, fountain, props, spawns };
}

export function areaNameAt(tileX: number, tileY: number): string {
  for (const area of AREAS) {
    const { x, y, width, height } = area.rect;
    if (tileX >= x && tileX < x + width && tileY >= y && tileY < y + height) {
      return area.name;
    }
  }
  return DEFAULT_AREA_NAME;
}
