import { MINIMAP_TERRAIN } from "@/game/bridge";
import {
  FIRST_GID,
  LAYER,
  OBJECT_TYPE,
  TILESET,
  isWaterGid,
  type TiledMap,
  type TiledObject,
  type TiledObjectLayer,
  type TiledTileLayer,
} from "./tiled";

export interface Navigation {
  width: number;
  height: number;
  /** 1 = walkable, 0 = blocked. */
  walkable: Uint8Array;
  /** MINIMAP_TERRAIN class per tile. */
  terrain: Uint8Array;
}

export function isTiledMap(value: unknown): value is TiledMap {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const map = value as Partial<TiledMap>;
  return (
    typeof map.width === "number" &&
    typeof map.height === "number" &&
    typeof map.tilewidth === "number" &&
    Array.isArray(map.layers) &&
    Array.isArray(map.tilesets)
  );
}

export function tileLayer(map: TiledMap, name: string): TiledTileLayer | undefined {
  return map.layers.find(
    (layer): layer is TiledTileLayer => layer.type === "tilelayer" && layer.name === name,
  );
}

export function objectLayer(
  map: TiledMap,
  name: string = LAYER.objects,
): TiledObjectLayer | undefined {
  return map.layers.find(
    (layer): layer is TiledObjectLayer => layer.type === "objectgroup" && layer.name === name,
  );
}

/** Tiled 1.9+ exports `class`; older versions use `type`. */
export function objectType(object: TiledObject): string {
  return object.type || (object as TiledObject & { class?: string }).class || "";
}

export function objectProperty(
  object: TiledObject,
  name: string,
): string | number | boolean | undefined {
  return object.properties?.find((property) => property.name === name)?.value;
}

const BLOCKING_OBJECTS: ReadonlySet<string> = new Set([
  OBJECT_TYPE.building,
  OBJECT_TYPE.fountain,
  OBJECT_TYPE.tree,
  OBJECT_TYPE.lamp,
]);

function isPathGid(gid: number): boolean {
  const index = gid - FIRST_GID;
  return index >= TILESET.path && index < TILESET.path + 16;
}

function isForestGid(gid: number): boolean {
  const index = gid - FIRST_GID;
  return index >= TILESET.forest && index < TILESET.forest + 16;
}

/** Derives the walkable grid and mini-map terrain from a Tiled map (generated or imported). */
export function buildNavigation(map: TiledMap): Navigation {
  const { width, height } = map;
  const size = width * height;
  const walkable = new Uint8Array(size).fill(1);
  const terrain = new Uint8Array(size).fill(MINIMAP_TERRAIN.grass);
  const ground = tileLayer(map, LAYER.ground)?.data ?? [];
  const obstacles = tileLayer(map, LAYER.obstacles)?.data ?? [];

  for (let i = 0; i < size; i += 1) {
    const groundGid = ground[i] ?? 0;
    const obstacleGid = obstacles[i] ?? 0;
    if (isWaterGid(groundGid)) {
      walkable[i] = 0;
      terrain[i] = MINIMAP_TERRAIN.water;
    } else if (isPathGid(groundGid)) {
      terrain[i] = MINIMAP_TERRAIN.path;
    }
    if (obstacleGid !== 0) {
      walkable[i] = 0;
      terrain[i] = isForestGid(obstacleGid) ? MINIMAP_TERRAIN.forest : MINIMAP_TERRAIN.blocked;
    }
  }

  const tw = map.tilewidth;
  const th = map.tileheight;
  for (const object of objectLayer(map)?.objects ?? []) {
    const type = objectType(object);
    if (!BLOCKING_OBJECTS.has(type)) {
      continue;
    }
    const x0 = Math.floor(object.x / tw);
    const y0 = Math.floor(object.y / th);
    const x1 = Math.max(x0 + 1, Math.ceil((object.x + object.width) / tw));
    const y1 = Math.max(y0 + 1, Math.ceil((object.y + object.height) / th));
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        if (x < 0 || y < 0 || x >= width || y >= height) {
          continue;
        }
        const i = y * width + x;
        walkable[i] = 0;
        terrain[i] =
          type === OBJECT_TYPE.building ? MINIMAP_TERRAIN.building : MINIMAP_TERRAIN.blocked;
      }
    }
  }

  return { width, height, walkable, terrain };
}
