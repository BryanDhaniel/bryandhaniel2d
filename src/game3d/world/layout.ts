import type { SectionId } from "@/content/portfolio";
import { hash2 } from "@/game/art/pixels";
import type { MapInfo, MapMarker } from "@/game/bridge";
import { buildNavigation, type Navigation } from "@/game/map/navigation";
import { LAYER, buildTiledMap, type TiledMap } from "@/game/map/tiled";
import {
  BUILDINGS,
  parseVillage,
  type BuildingId,
  type NpcKind,
  type ParsedVillage,
  type TileRect,
  type TreeVariant,
} from "@/game/map/village";
import { WORLD } from "@/game3d/config/visuals";
import { CollisionWorld, type Box, type Circle } from "@/game3d/systems/collision";

/**
 * Everything the 3D world derives from the ASCII village map: ground heights, colliders,
 * doorway zones, prop placements and spawns. Pure data (no three.js), so it is unit-tested.
 * One world unit is one tile; tile (x, y) covers x..x+1 on the X axis and y..y+1 on Z.
 */

export interface Zone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface BuildingLayout {
  id: BuildingId;
  label: string;
  sectionId: SectionId;
  rect: TileRect;
  centerX: number;
  centerZ: number;
  /** Door position on the front (south, +Z) face. */
  doorX: number;
  doorZ: number;
  /** The walkable tile in front of the door. */
  approachX: number;
  approachZ: number;
  /** Standing here opens the building and fades its roof and front walls. */
  zone: Zone;
}

export interface Placement {
  x: number;
  z: number;
  /** Rotation around Y (radians) and uniform scale, varied per placement. */
  rotation: number;
  scale: number;
}

export interface TreePlacement extends Placement {
  variant: TreeVariant;
}

export interface FencePlacement {
  x: number;
  z: number;
  /** Rails toward the east and south neighbours. */
  east: boolean;
  south: boolean;
}

export type DecorKind = "barrel" | "crate";

export interface DecorPlacement extends Placement {
  kind: DecorKind;
}

export interface WorldLayout {
  width: number;
  height: number;
  village: ParsedVillage;
  tiled: TiledMap;
  nav: Navigation;
  /** Tiled ground GIDs (autotiled), one per tile. */
  ground: readonly number[];
  /** Top height of each tile's ground. */
  heights: Float32Array;
  collision: CollisionWorld;
  /** Pathfinding grids: everyone, and NPCs (who keep out of doorways). */
  walkable: Uint8Array;
  npcWalkable: Uint8Array;
  buildings: BuildingLayout[];
  trees: TreePlacement[];
  lamps: Placement[];
  bushes: Placement[];
  rocks: Placement[];
  planters: Placement[];
  stalls: Placement[];
  benches: Placement[];
  wells: Placement[];
  fences: FencePlacement[];
  decor: DecorPlacement[];
  fountain: { x: number; z: number; radius: number } | null;
  spawns: { kind: "player" | NpcKind; x: number; z: number }[];
  /** Open grass spots where birds hop about. */
  birdSpots: { x: number; z: number }[];
}

const DECOR: readonly { kind: DecorKind; x: number; z: number }[] = [
  { kind: "barrel", x: 36.45, z: 4.4 },
  { kind: "crate", x: 36.5, z: 5.45 },
  { kind: "barrel", x: 36.4, z: 6.3 },
  { kind: "crate", x: 22.45, z: 21.45 },
  { kind: "barrel", x: 23.35, z: 21.35 },
];

const BIRD_SPOTS = 3;

function zoneFor(building: BuildingLayout): Zone {
  const half = building.id === "mailbox" ? 0.75 : 1.05;
  const z = building.rect.y + building.rect.height;
  return {
    minX: building.doorX - half,
    maxX: building.doorX + half,
    minZ: z - 0.05,
    maxZ: z + 1.15,
  };
}

export function inZone(zone: Zone, x: number, z: number): boolean {
  return x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ;
}

export function buildLayout(village: ParsedVillage = parseVillage()): WorldLayout {
  const tiled = buildTiledMap(village);
  const nav = buildNavigation(tiled);
  const { width, height } = village;
  const size = width * height;
  const groundLayer = tiled.layers.find(
    (layer) => layer.type === "tilelayer" && layer.name === LAYER.ground,
  );
  const ground = groundLayer && groundLayer.type === "tilelayer" ? groundLayer.data : [];

  const heights = new Float32Array(size);
  const solid = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    const kind = village.ground[i];
    const obstacle = village.obstacles[i];
    if (kind === "water" || kind === "bridge") {
      heights[i] = WORLD.waterBed;
      solid[i] = kind === "water" ? 1 : 0;
    } else if (kind === "cobble") {
      heights[i] = WORLD.plazaHeight;
    } else if (obstacle === "forest") {
      heights[i] = WORLD.forestHeight;
    }
    if (obstacle === "forest" || obstacle === "fence" || obstacle === "planter") {
      solid[i] = 1;
    }
  }

  const circles: Circle[] = [];
  const boxes: Box[] = [];
  const buildings: BuildingLayout[] = [];
  for (const parsed of village.buildings) {
    const info = BUILDINGS[parsed.id];
    const { rect } = parsed;
    if (parsed.id === "mailbox") {
      circles.push({ x: rect.x + 0.5, z: rect.y + 0.55, r: 0.28 });
    } else {
      for (let y = rect.y; y < rect.y + rect.height; y += 1) {
        for (let x = rect.x; x < rect.x + rect.width; x += 1) {
          solid[y * width + x] = 1;
        }
      }
    }
    const building: BuildingLayout = {
      id: parsed.id,
      label: info.label,
      sectionId: info.section,
      rect,
      centerX: rect.x + rect.width / 2,
      centerZ: rect.y + rect.height / 2,
      doorX: parsed.door.x + 0.5,
      doorZ: rect.y + rect.height,
      approachX: parsed.door.x,
      approachZ: parsed.door.y + 1,
      zone: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
    };
    building.zone = zoneFor(building);
    buildings.push(building);
  }

  const vary = (x: number, z: number, seed: number): Placement => ({
    x,
    z,
    rotation: hash2(Math.floor(x * 7), Math.floor(z * 7), seed) * Math.PI * 2,
    scale: 0.85 + hash2(Math.floor(x * 5), Math.floor(z * 5), seed + 1) * 0.3,
  });

  const trees: TreePlacement[] = [];
  const lamps: Placement[] = [];
  const stalls: Placement[] = [];
  const benches: Placement[] = [];
  const wells: Placement[] = [];
  for (const prop of village.props) {
    const cx = prop.x + 0.5;
    const cz = prop.y + 0.5;
    switch (prop.kind) {
      case "tree":
        trees.push({ ...vary(cx, cz, 3), variant: prop.variant ?? "oak" });
        circles.push({ x: cx, z: cz, r: 0.3 });
        break;
      case "lamp":
        lamps.push({ ...vary(cx, cz, 5), rotation: 0, scale: 1 });
        circles.push({ x: cx, z: cz, r: 0.15 });
        break;
      case "stall":
        stalls.push({ x: prop.x + 1, z: cz, rotation: 0, scale: 1 });
        boxes.push({
          minX: prop.x + 0.1,
          minZ: prop.y + 0.12,
          maxX: prop.x + 1.9,
          maxZ: prop.y + 0.88,
        });
        break;
      case "bench":
        benches.push({ x: cx, z: cz, rotation: 0, scale: 1 });
        boxes.push({ minX: prop.x + 0.08, minZ: cz - 0.2, maxX: prop.x + 0.92, maxZ: cz + 0.2 });
        break;
      case "well":
        wells.push({ x: cx, z: cz, rotation: 0, scale: 1 });
        circles.push({ x: cx, z: cz, r: 0.48 });
        break;
    }
  }

  const bushes: Placement[] = [];
  const rocks: Placement[] = [];
  const planters: Placement[] = [];
  const fences: FencePlacement[] = [];
  const isFence = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && village.obstacles[y * width + x] === "fence";
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const obstacle = village.obstacles[y * width + x];
      const cx = x + 0.5;
      const cz = y + 0.5;
      if (obstacle === "forest") {
        // Dense woods on the raised border; skip a few tiles so it doesn't look planted.
        if (hash2(x, y, 11) < 0.82) {
          const r = hash2(x, y, 12);
          const variant: TreeVariant = r < 0.6 ? "pine" : r < 0.85 ? "oak" : "birch";
          trees.push({
            x: cx + (hash2(x, y, 13) - 0.5) * 0.5,
            z: cz + (hash2(x, y, 14) - 0.5) * 0.5,
            rotation: hash2(x, y, 15) * Math.PI * 2,
            scale: 0.9 + hash2(x, y, 16) * 0.45,
            variant,
          });
        }
      } else if (obstacle === "bush") {
        bushes.push(vary(cx, cz, 7));
        circles.push({ x: cx, z: cz, r: 0.42 });
      } else if (obstacle === "rock") {
        rocks.push(vary(cx, cz, 9));
        circles.push({ x: cx, z: cz, r: 0.42 });
      } else if (obstacle === "planter") {
        planters.push({ x: cx, z: cz, rotation: 0, scale: 1 });
      } else if (obstacle === "fence") {
        fences.push({ x: cx, z: cz, east: isFence(x + 1, y), south: isFence(x, y + 1) });
      }
    }
  }

  const walkable = Uint8Array.from(nav.walkable);
  const decor: DecorPlacement[] = DECOR.map((entry) => ({
    ...vary(entry.x, entry.z, 17),
    kind: entry.kind,
  }));
  for (const entry of decor) {
    circles.push({ x: entry.x, z: entry.z, r: 0.34 });
    walkable[Math.floor(entry.z) * width + Math.floor(entry.x)] = 0;
  }

  let fountain: WorldLayout["fountain"] = null;
  if (village.fountain) {
    const f = village.fountain;
    fountain = {
      x: f.x + f.width / 2,
      z: f.y + f.height / 2,
      radius: Math.min(f.width, f.height) / 2,
    };
    circles.push({ x: fountain.x, z: fountain.z, r: fountain.radius * 0.95 });
  }

  // NPCs never wander into doorways, so they can't block an interaction.
  const npcWalkable = Uint8Array.from(walkable);
  for (const building of buildings) {
    const { zone } = building;
    for (let y = Math.floor(zone.minZ) - 1; y <= Math.floor(zone.maxZ); y += 1) {
      for (let x = Math.floor(zone.minX); x <= Math.floor(zone.maxX); x += 1) {
        if (x >= 0 && y >= 0 && x < width && y < height) npcWalkable[y * width + x] = 0;
      }
    }
  }

  const spawns = village.spawns.map((spawn) => ({
    kind: spawn.kind,
    x: spawn.x + 0.5,
    z: spawn.y + 0.5,
  }));

  const birdSpots: { x: number; z: number }[] = [];
  const candidates: number[] = [];
  for (let i = 0; i < size; i += 1) {
    if (village.ground[i] === "grass" && npcWalkable[i] === 1 && !village.obstacles[i]) {
      candidates.push(i);
    }
  }
  candidates.sort((a, b) => hash2(a, 3, 71) - hash2(b, 3, 71));
  for (const index of candidates) {
    if (birdSpots.length >= BIRD_SPOTS) break;
    const x = (index % width) + 0.5;
    const z = Math.floor(index / width) + 0.5;
    if (birdSpots.every((spot) => Math.hypot(spot.x - x, spot.z - z) > 8)) {
      birdSpots.push({ x, z });
    }
  }

  return {
    width,
    height,
    village,
    tiled,
    nav,
    ground,
    heights,
    collision: new CollisionWorld(width, height, solid, circles, boxes),
    walkable,
    npcWalkable,
    buildings,
    trees,
    lamps,
    bushes,
    rocks,
    planters,
    stalls,
    benches,
    wells,
    fences,
    decor,
    fountain,
    spawns,
    birdSpots,
  };
}

/** Height of the ground the player stands on at (x, z): bridges carry a deck over the water. */
export function groundHeight(layout: WorldLayout, x: number, z: number): number {
  const tx = Math.floor(x);
  const tz = Math.floor(z);
  if (tx < 0 || tz < 0 || tx >= layout.width || tz >= layout.height) {
    return 0;
  }
  const index = tz * layout.width + tx;
  if (layout.village.ground[index] === "bridge") {
    return WORLD.bridgeDeck;
  }
  return layout.heights[index] ?? 0;
}

/** The HUD mini-map payload: terrain classes per tile plus a marker per building door. */
export function mapInfoFor(layout: WorldLayout): MapInfo {
  const markers: MapMarker[] = layout.buildings
    .filter((building) => building.id !== "mailbox")
    .map((building) => ({
      buildingId: building.id,
      sectionId: building.sectionId,
      label: building.label,
      tileX: building.approachX,
      tileY: building.approachZ - 1,
    }));
  return {
    width: layout.width,
    height: layout.height,
    terrain: layout.nav.terrain,
    markers,
  };
}
