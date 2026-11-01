import { describe, expect, it } from "vitest";
import { buildNavigation } from "@/game/map/navigation";
import { FIRST_GID, LAYER, TILESET, buildTiledMap, type TiledTileLayer } from "@/game/map/tiled";
import { BUILDINGS, VILLAGE_ROWS, parseVillage } from "@/game/map/village";
import { GridPathfinder } from "@/game3d/systems/pathfinding";
import { portfolio } from "@/content/portfolio";

const village = parseVillage();
const tiled = buildTiledMap(village);
const nav = buildNavigation(tiled);

function layer(name: string): TiledTileLayer {
  const found = tiled.layers.find((entry) => entry.name === name);
  if (!found || found.type !== "tilelayer") throw new Error(`missing ${name}`);
  return found;
}

describe("village map", () => {
  it("is a 40x30 grid", () => {
    expect(VILLAGE_ROWS).toHaveLength(30);
    expect(village.width).toBe(40);
    expect(village.height).toBe(30);
  });

  it("places every building, each mapped to a real portfolio section", () => {
    const ids = village.buildings.map((building) => building.id).sort();
    expect(ids).toEqual(["ailab", "home", "inn", "library", "mailbox", "workshop"]);
    const sections = new Set(portfolio.sections.map((section) => section.id));
    for (const building of village.buildings) {
      expect(sections.has(BUILDINGS[building.id].section)).toBe(true);
    }
  });

  it("puts a path tile in front of every door", () => {
    for (const building of village.buildings) {
      const front = village.ground[(building.door.y + 1) * village.width + building.door.x];
      expect(front, building.id).toBe("path");
    }
  });

  it("lets the player walk from the spawn to every door", () => {
    const spawn = village.spawns.find((entry) => entry.kind === "player");
    expect(spawn).toBeDefined();
    const finder = new GridPathfinder(nav.width, nav.height, nav.walkable);
    const out = new Int32Array(nav.width * nav.height);
    for (const building of village.buildings) {
      const length = finder.findPath(spawn!.x, spawn!.y, building.door.x, building.door.y + 1, out);
      expect(length, `path to ${building.id}`).toBeGreaterThan(0);
    }
  });

  it("emits Tiled layers with in-range tile ids", () => {
    const maxGid = FIRST_GID + TILESET.columns * TILESET.rows;
    for (const name of [LAYER.ground, LAYER.obstacles]) {
      const data = layer(name).data;
      expect(data).toHaveLength(40 * 30);
      for (const value of data) {
        expect(value === 0 || (value >= FIRST_GID && value < maxGid)).toBe(true);
      }
    }
  });

  it("blocks water, forest and building footprints", () => {
    const at = (x: number, y: number) => nav.walkable[y * nav.width + x];
    expect(at(0, 0)).toBe(0); // forest
    expect(at(5, 22)).toBe(0); // pond
    expect(at(5, 4)).toBe(0); // home
    expect(at(19, 15)).toBe(1); // spawn
  });
});

describe("pathfinder", () => {
  it("routes around walls without cutting corners", () => {
    // 5x3 grid with a wall in the middle column except the bottom row.
    const grid = Uint8Array.from([1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1]);
    const finder = new GridPathfinder(5, 3, grid);
    const out = new Int32Array(16);
    const length = finder.findPath(0, 0, 4, 0, out);
    expect(length).toBeGreaterThan(0);
    const path = Array.from(out.slice(0, length));
    expect(path.at(-1)).toBe(4);
    expect(path).toContain(2 * 5 + 2); // must pass under the wall
  });

  it("returns 0 for unreachable goals and finds the nearest open tile", () => {
    const grid = Uint8Array.from([1, 0, 1]);
    const finder = new GridPathfinder(3, 1, grid);
    expect(finder.findPath(0, 0, 2, 0, new Int32Array(4))).toBe(0);
    expect(finder.nearestWalkable(1, 0, 1)).toBe(0);
  });
});
