import { describe, expect, it } from "vitest";
import { WORLD } from "@/game3d/config/visuals";
import { CollisionWorld } from "@/game3d/systems/collision";
import { PathFollower } from "@/game3d/systems/pathing";
import { GridPathfinder } from "@/game3d/systems/pathfinding";
import { buildLayout, groundHeight, inZone, mapInfoFor } from "@/game3d/world/layout";

const layout = buildLayout();
const tileIndex = (x: number, z: number) => Math.floor(z) * layout.width + Math.floor(x);

describe("world layout", () => {
  it("places every building with a doorway zone in front of its door", () => {
    expect(layout.buildings.map((building) => building.id).sort()).toEqual([
      "ailab",
      "home",
      "inn",
      "library",
      "mailbox",
      "workshop",
    ]);
    for (const building of layout.buildings) {
      expect(inZone(building.zone, building.approachX + 0.5, building.approachZ + 0.5)).toBe(true);
      expect(layout.walkable[tileIndex(building.approachX, building.approachZ)]).toBe(1);
      // NPCs keep out of doorways so they never block an interaction.
      expect(layout.npcWalkable[tileIndex(building.approachX, building.approachZ)]).toBe(0);
    }
  });

  it("raises the plaza and the woods and sinks the ponds", () => {
    const cobble = layout.village.ground.indexOf("cobble");
    const water = layout.village.ground.indexOf("water");
    const forest = layout.village.obstacles.indexOf("forest");
    expect(layout.heights[cobble]).toBeCloseTo(WORLD.plazaHeight);
    expect(layout.heights[water]).toBeCloseTo(WORLD.waterBed);
    expect(layout.heights[forest]).toBeCloseTo(WORLD.forestHeight);
  });

  it("carries the road over the creek on a bridge deck", () => {
    const bridge = layout.village.ground.indexOf("bridge");
    expect(bridge).toBeGreaterThanOrEqual(0);
    const x = (bridge % layout.width) + 0.5;
    const z = Math.floor(bridge / layout.width) + 0.5;
    expect(groundHeight(layout, x, z)).toBeCloseTo(WORLD.bridgeDeck);
    expect(layout.collision.isSolidTile(Math.floor(x), Math.floor(z))).toBe(false);
  });

  it("spawns everyone on walkable ground", () => {
    for (const spawn of layout.spawns) {
      expect(layout.walkable[tileIndex(spawn.x, spawn.z)], spawn.kind).toBe(1);
      expect(layout.collision.isFree(spawn.x, spawn.z, 0.27), spawn.kind).toBe(true);
    }
    expect(layout.birdSpots.length).toBeGreaterThan(0);
  });

  it("gives the mini-map one marker per section building", () => {
    const info = mapInfoFor(layout);
    expect(info.terrain).toHaveLength(layout.width * layout.height);
    expect(info.markers.map((marker) => marker.buildingId).sort()).toEqual([
      "ailab",
      "home",
      "inn",
      "library",
      "workshop",
    ]);
  });
});

describe("collision", () => {
  // A 3x3 room with a solid middle tile, a post at (0.5, 2.5) and a box on the right.
  const solid = new Uint8Array(9);
  solid[4] = 1;
  const world = new CollisionWorld(
    3,
    3,
    solid,
    [{ x: 0.5, z: 2.5, r: 0.1 }],
    [{ minX: 2.6, minZ: 0, maxX: 3, maxZ: 1 }],
  );

  it("stops at solid tiles and the map edge", () => {
    const position = { x: 0.5, z: 1.5 };
    world.move(position, 2, 0, 0.25);
    expect(position.x).toBeCloseTo(0.75);
    const edge = { x: 0.5, z: 0.5 };
    world.move(edge, -3, 0, 0.25);
    expect(edge.x).toBeCloseTo(0.25);
  });

  it("slides along walls instead of sticking", () => {
    // Walking diagonally into the top face of the solid tile keeps the sideways motion.
    const position = { x: 1.4, z: 0.5 };
    world.move(position, 0.3, 0.4, 0.25);
    expect(position.x).toBeCloseTo(1.7);
    expect(position.z).toBeCloseTo(0.75);
  });

  it("pushes out of posts and boxes", () => {
    const post = { x: 0.5, z: 2.2 };
    world.move(post, 0, 0.2, 0.25);
    expect(Math.hypot(post.x - 0.5, post.z - 2.5)).toBeGreaterThanOrEqual(0.35 - 1e-6);
    const box = { x: 2.2, z: 0.5 };
    world.move(box, 0.5, 0, 0.25);
    expect(box.x).toBeLessThanOrEqual(2.35 + 1e-6);
  });
});

describe("path following", () => {
  it("walks tile centres to the goal and reports arrival once", () => {
    const finder = new GridPathfinder(layout.width, layout.height, layout.walkable);
    const follower = new PathFollower(finder, layout.width * layout.height);
    const spawn = layout.spawns.find((entry) => entry.kind === "player");
    const home = layout.buildings.find((building) => building.id === "home");
    expect(spawn && home).toBeTruthy();
    if (!spawn || !home) return;
    expect(
      follower.plan(Math.floor(spawn.x), Math.floor(spawn.z), home.approachX, home.approachZ),
    ).toBe(true);
    const position = { x: spawn.x, z: spawn.z };
    const steer = { x: 0, z: 0 };
    let arrived = false;
    for (let step = 0; step < 4000 && !arrived; step += 1) {
      if (follower.steer(position.x, position.z, steer)) {
        position.x += steer.x * 0.05;
        position.z += steer.z * 0.05;
      }
      arrived = follower.arrived;
    }
    expect(arrived).toBe(true);
    expect(
      Math.hypot(position.x - (home.approachX + 0.5), position.z - (home.approachZ + 0.5)),
    ).toBeLessThan(0.2);
  });
});
