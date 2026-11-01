import { hash2 } from "@/game/art/pixels";
import {
  AREAS,
  BUILDINGS,
  PROP_TILES,
  TILE_SIZE,
  parseVillage,
  type Ground,
  type Obstacle,
  type ParsedVillage,
  type PropKind,
} from "./village";

/**
 * Tileset layout shared by the tile generator and the map builder. A replacement tileset
 * image must keep this layout: 16 columns of 16x16 tiles, indices as below.
 * Autotiles add a 4-bit neighbour mask: N=1, E=2, S=4, W=8 (a set bit means "same kind").
 */
export const TILESET = {
  name: "village-tiles",
  columns: 16,
  rows: 9,
  grass: 0,
  grassVariants: 4,
  flowers: 4,
  flowerVariants: 4,
  bush: 8,
  rock: 9,
  planter: 10,
  path: 16,
  water: 32,
  waterFrames: 3,
  fence: 80,
  forest: 96,
  cobble: 112,
  bridge: 128,
} as const;

export const MASK = { N: 1, E: 2, S: 4, W: 8 } as const;

/** Tiled global tile ids start at 1 (0 means "empty"). */
export const FIRST_GID = 1;

export function gid(tileIndex: number): number {
  return tileIndex + FIRST_GID;
}

export function isWaterGid(value: number): boolean {
  const index = value - FIRST_GID;
  return index >= TILESET.water && index < TILESET.water + TILESET.waterFrames * 16;
}

function inAutotile(value: number, start: number): boolean {
  const index = value - FIRST_GID;
  return index >= start && index < start + 16;
}

/** Dirt paths, cobblestones and the bridge: everything that reads as "paved" on the mini-map. */
export function isPavedGid(value: number): boolean {
  return (
    inAutotile(value, TILESET.path) ||
    inAutotile(value, TILESET.cobble) ||
    inAutotile(value, TILESET.bridge)
  );
}

export function isForestGid(value: number): boolean {
  return inAutotile(value, TILESET.forest);
}

// ---- Minimal Tiled JSON types (the subset Phaser's Tiled parser reads) ----

export type TiledPropertyValue = string | number | boolean;

export interface TiledProperty {
  name: string;
  type: "string" | "int" | "float" | "bool";
  value: TiledPropertyValue;
}

export interface TiledObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: 0;
  visible: true;
  point?: true;
  properties?: TiledProperty[];
}

export interface TiledTileLayer {
  id: number;
  name: string;
  type: "tilelayer";
  width: number;
  height: number;
  x: 0;
  y: 0;
  opacity: 1;
  visible: true;
  data: number[];
}

export interface TiledObjectLayer {
  id: number;
  name: string;
  type: "objectgroup";
  draworder: "topdown";
  x: 0;
  y: 0;
  opacity: 1;
  visible: true;
  objects: TiledObject[];
}

export interface TiledTileset {
  firstgid: number;
  name: string;
  tilewidth: number;
  tileheight: number;
  tilecount: number;
  columns: number;
  image: string;
  imagewidth: number;
  imageheight: number;
  margin: 0;
  spacing: 0;
}

export interface TiledMap {
  type: "map";
  version: string;
  tiledversion: string;
  orientation: "orthogonal";
  renderorder: "right-down";
  infinite: false;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  nextlayerid: number;
  nextobjectid: number;
  layers: (TiledTileLayer | TiledObjectLayer)[];
  tilesets: TiledTileset[];
}

export const LAYER = {
  ground: "ground",
  obstacles: "obstacles",
  objects: "objects",
} as const;

export const OBJECT_TYPE = {
  building: "building",
  fountain: "fountain",
  tree: "tree",
  lamp: "lamp",
  stall: "stall",
  bench: "bench",
  well: "well",
  spawn: "spawn",
  area: "area",
} as const;

const PROP_OBJECT_TYPE: Record<PropKind, string> = {
  tree: OBJECT_TYPE.tree,
  lamp: OBJECT_TYPE.lamp,
  stall: OBJECT_TYPE.stall,
  bench: OBJECT_TYPE.bench,
  well: OBJECT_TYPE.well,
};

// ---- Builder ----

function neighbourMask(
  village: ParsedVillage,
  x: number,
  y: number,
  same: (index: number) => boolean,
  outsideCounts: boolean,
): number {
  const test = (nx: number, ny: number) => {
    if (nx < 0 || ny < 0 || nx >= village.width || ny >= village.height) {
      return outsideCounts;
    }
    return same(ny * village.width + nx);
  };
  let mask = 0;
  if (test(x, y - 1)) mask |= MASK.N;
  if (test(x + 1, y)) mask |= MASK.E;
  if (test(x, y + 1)) mask |= MASK.S;
  if (test(x - 1, y)) mask |= MASK.W;
  return mask;
}

const PAVED: ReadonlySet<Ground> = new Set<Ground>(["path", "cobble", "bridge"]);

function groundTile(village: ParsedVillage, kind: Ground, x: number, y: number): number {
  const is = (target: Ground) => (index: number) => village.ground[index] === target;
  const paved = (index: number) => PAVED.has(village.ground[index] ?? "grass");
  switch (kind) {
    case "grass":
      return TILESET.grass + Math.floor(hash2(x, y, 7) * TILESET.grassVariants);
    case "flowers":
      return TILESET.flowers + Math.floor(hash2(x, y, 11) * TILESET.flowerVariants);
    case "path":
      // Dirt runs straight into cobbles and the bridge without a grass verge.
      return TILESET.path + neighbourMask(village, x, y, paved, true);
    case "cobble":
      return TILESET.cobble + neighbourMask(village, x, y, is("cobble"), true);
    case "bridge":
      return TILESET.bridge + neighbourMask(village, x, y, is("bridge"), false);
    case "water":
      return TILESET.water + neighbourMask(village, x, y, is("water"), true);
  }
}

function obstacleTile(village: ParsedVillage, kind: Obstacle, x: number, y: number): number {
  const is = (target: Obstacle) => (index: number) => village.obstacles[index] === target;
  switch (kind) {
    case "forest":
      return TILESET.forest + neighbourMask(village, x, y, is("forest"), true);
    case "fence":
      return TILESET.fence + neighbourMask(village, x, y, is("fence"), false);
    case "bush":
      return TILESET.bush;
    case "rock":
      return TILESET.rock;
    case "planter":
      return TILESET.planter;
  }
}

function prop(name: string, type: string, value: TiledPropertyValue): TiledProperty {
  const kind: TiledProperty["type"] =
    typeof value === "boolean" ? "bool" : typeof value === "number" ? "int" : "string";
  return { name, type: kind, value };
}

/** Builds Tiled-compatible JSON from the ASCII village (or any parsed layout). */
export function buildTiledMap(village: ParsedVillage = parseVillage()): TiledMap {
  const groundData: number[] = [];
  const obstacleData: number[] = [];
  for (let y = 0; y < village.height; y += 1) {
    for (let x = 0; x < village.width; x += 1) {
      const index = y * village.width + x;
      const groundKind = village.ground[index] ?? "grass";
      groundData.push(gid(groundTile(village, groundKind, x, y)));
      const obstacle = village.obstacles[index] ?? null;
      obstacleData.push(obstacle ? gid(obstacleTile(village, obstacle, x, y)) : 0);
    }
  }

  const objects: TiledObject[] = [];
  let nextId = 1;
  const add = (object: Omit<TiledObject, "id" | "rotation" | "visible">) => {
    objects.push({ ...object, id: nextId, rotation: 0, visible: true });
    nextId += 1;
  };

  for (const building of village.buildings) {
    const info = BUILDINGS[building.id];
    add({
      name: building.id,
      type: OBJECT_TYPE.building,
      x: building.rect.x * TILE_SIZE,
      y: building.rect.y * TILE_SIZE,
      width: building.rect.width * TILE_SIZE,
      height: building.rect.height * TILE_SIZE,
      properties: [
        prop("section", "string", info.section),
        prop("label", "string", info.label),
        prop("doorX", "int", building.door.x),
        prop("doorY", "int", building.door.y),
      ],
    });
  }

  if (village.fountain) {
    add({
      name: "fountain",
      type: OBJECT_TYPE.fountain,
      x: village.fountain.x * TILE_SIZE,
      y: village.fountain.y * TILE_SIZE,
      width: village.fountain.width * TILE_SIZE,
      height: village.fountain.height * TILE_SIZE,
    });
  }

  for (const item of village.props) {
    const size = PROP_TILES[item.kind];
    add({
      name: item.variant ?? item.kind,
      type: PROP_OBJECT_TYPE[item.kind],
      x: item.x * TILE_SIZE,
      y: item.y * TILE_SIZE,
      width: size.width * TILE_SIZE,
      height: size.height * TILE_SIZE,
      properties: item.variant ? [prop("variant", "string", item.variant)] : undefined,
    });
  }

  for (const spawn of village.spawns) {
    add({
      name: spawn.kind,
      type: OBJECT_TYPE.spawn,
      x: spawn.x * TILE_SIZE + TILE_SIZE / 2,
      y: spawn.y * TILE_SIZE + TILE_SIZE / 2,
      width: 0,
      height: 0,
      point: true,
    });
  }

  for (const area of AREAS) {
    add({
      name: area.name,
      type: OBJECT_TYPE.area,
      x: area.rect.x * TILE_SIZE,
      y: area.rect.y * TILE_SIZE,
      width: area.rect.width * TILE_SIZE,
      height: area.rect.height * TILE_SIZE,
    });
  }

  const layerBase = {
    width: village.width,
    height: village.height,
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
  } as const;

  return {
    type: "map",
    version: "1.10",
    tiledversion: "1.10.2",
    orientation: "orthogonal",
    renderorder: "right-down",
    infinite: false,
    width: village.width,
    height: village.height,
    tilewidth: TILE_SIZE,
    tileheight: TILE_SIZE,
    nextlayerid: 4,
    nextobjectid: nextId,
    layers: [
      { ...layerBase, id: 1, name: LAYER.ground, type: "tilelayer", data: groundData },
      { ...layerBase, id: 2, name: LAYER.obstacles, type: "tilelayer", data: obstacleData },
      {
        id: 3,
        name: LAYER.objects,
        type: "objectgroup",
        draworder: "topdown",
        x: 0,
        y: 0,
        opacity: 1,
        visible: true,
        objects,
      },
    ],
    tilesets: [
      {
        firstgid: FIRST_GID,
        name: TILESET.name,
        tilewidth: TILE_SIZE,
        tileheight: TILE_SIZE,
        tilecount: TILESET.columns * TILESET.rows,
        columns: TILESET.columns,
        image: "tiles.png",
        imagewidth: TILESET.columns * TILE_SIZE,
        imageheight: TILESET.rows * TILE_SIZE,
        margin: 0,
        spacing: 0,
      },
    ],
  };
}
