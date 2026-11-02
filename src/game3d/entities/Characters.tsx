"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { useStore } from "zustand";
import type { Facing } from "@/game/art/characters";
import type { NpcKind } from "@/game/map/village";
import { MOVE, QUALITY_TIERS, SPRITES } from "@/game3d/config/visuals";
import { billboardYaw, useRuntime, type WorldRuntime } from "@/game3d/runtime";
import { useAssets } from "@/game3d/scene/assets";
import { PathFollower } from "@/game3d/systems/pathing";
import { GridPathfinder } from "@/game3d/systems/pathfinding";
import { CHARACTER_SHEET } from "@/game3d/textures/sprites";
import { groundHeight } from "@/game3d/world/layout";
import { Billboard } from "./billboard";

/** Screen-relative facing for a world-space direction, given the camera basis. */
export function facingFor(runtime: WorldRuntime, dx: number, dz: number): Facing {
  const { rightX, rightZ, forwardX, forwardZ } = runtime.camera;
  const sx = dx * rightX + dz * rightZ;
  const sy = dx * forwardX + dz * forwardZ;
  if (Math.abs(sx) > Math.abs(sy)) return sx > 0 ? "right" : "left";
  return sy > 0 ? "up" : "down";
}

function facingRow(facing: Facing): number {
  return CHARACTER_SHEET.facings.indexOf(facing);
}

interface Walker {
  kind: NpcKind;
  billboard: Billboard;
  x: number;
  z: number;
  homeX: number;
  homeZ: number;
  dirX: number;
  dirZ: number;
  timer: number;
  idle: number;
  moving: boolean;
  path: PathFollower;
  frameTime: number;
  facing: Facing;
  /** Screen-space x direction last moved (the cat only has side views). */
  lastSide: number;
}

interface Bird {
  billboard: Billboard;
  x: number;
  y: number;
  z: number;
  spot: number;
  hopTimer: number;
  hopFrom: [number, number];
  hopTo: [number, number];
  hopT: number;
  flying: boolean;
  flyFrom: [number, number];
  flyTo: [number, number];
  flyT: number;
  side: number;
}

const WANDER_RADIUS: Record<NpcKind, number> = { villager: 4, elder: 3, cat: 5 };

/** Villagers, the cat and birds, all as pixel billboards (the player has its own component). */
export function Characters() {
  const runtime = useRuntime();
  const assets = useAssets();
  const level = useStore(runtime.store, (state) => state.level);
  const realShadows = QUALITY_TIERS[level].sunShadows;

  const cast = useMemo(() => {
    const { layout } = runtime;
    const finder = new GridPathfinder(layout.width, layout.height, layout.npcWalkable);
    const walkers: Walker[] = layout.spawns
      .filter((spawn): spawn is { kind: NpcKind; x: number; z: number } => spawn.kind !== "player")
      .map((spawn, index) => ({
        kind: spawn.kind,
        billboard: new Billboard(assets.sheet, runtime.uniforms),
        x: spawn.x,
        z: spawn.z,
        homeX: spawn.x,
        homeZ: spawn.z,
        dirX: 0,
        dirZ: 0,
        timer: 1 + index,
        idle: 0,
        moving: false,
        path: new PathFollower(finder, 256),
        frameTime: 0,
        facing: "down" as Facing,
        lastSide: 1,
      }));
    const birds: Bird[] = layout.birdSpots.map((spot, index) => ({
      billboard: new Billboard(assets.sheet, runtime.uniforms, { width: 0.6, height: 0.6 }),
      x: spot.x,
      y: groundHeight(layout, spot.x, spot.z),
      z: spot.z,
      spot: index,
      hopTimer: index * 0.4,
      hopFrom: [spot.x, spot.z],
      hopTo: [spot.x, spot.z],
      hopT: 1,
      flying: false,
      flyFrom: [spot.x, spot.z],
      flyTo: [spot.x, spot.z],
      flyT: 0,
      side: 1,
    }));
    return { walkers, birds, finder, steer: { x: 0, z: 0 } };
  }, [runtime, assets]);

  useEffect(
    () => () => {
      cast.walkers.forEach((walker) => walker.billboard.dispose());
      cast.birds.forEach((bird) => bird.billboard.dispose());
    },
    [cast],
  );

  useEffect(() => {
    for (const billboard of [
      ...cast.walkers.map((w) => w.billboard),
      ...cast.birds.map((b) => b.billboard),
    ]) {
      billboard.setShadowMode(realShadows);
    }
  }, [cast, realShadows]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const { layout, player, camera } = runtime;
    const sun = runtime.cycle.state.sunDirection;
    const sunYaw = Math.atan2(sun[0] ?? 0, sun[2] ?? 1);
    const time = runtime.elapsed;

    // Villagers and the cat wander between idle pauses, never into doorways.
    for (const walker of cast.walkers) {
      const near = Math.hypot(walker.x - player.x, walker.z - player.z) < 0.95;
      if (!walker.moving) {
        walker.timer -= delta;
        walker.idle += delta;
        if (walker.timer <= 0) {
          const radius = WANDER_RADIUS[walker.kind];
          for (let attempt = 0; attempt < 8 && !walker.moving; attempt += 1) {
            const tx = Math.floor(walker.homeX + (Math.random() * 2 - 1) * radius);
            const tz = Math.floor(walker.homeZ + (Math.random() * 2 - 1) * radius);
            if (!cast.finder.isWalkable(tx, tz)) continue;
            if (walker.path.plan(Math.floor(walker.x), Math.floor(walker.z), tx, tz)) {
              walker.moving = true;
              walker.idle = 0;
            }
          }
          walker.timer = 2 + Math.random() * 4;
        }
      } else if (!near) {
        const steer = cast.steer;
        if (walker.path.steer(walker.x, walker.z, steer)) {
          const speed =
            MOVE.npcSpeed * (walker.kind === "cat" ? 0.8 : walker.kind === "elder" ? 0.75 : 1);
          walker.x += steer.x * speed * delta;
          walker.z += steer.z * speed * delta;
          walker.dirX = steer.x;
          walker.dirZ = steer.z;
          walker.facing = facingFor(runtime, steer.x, steer.z);
          const side = steer.x * camera.rightX + steer.z * camera.rightZ;
          if (Math.abs(side) > 0.2) walker.lastSide = Math.sign(side);
          walker.frameTime += delta;
        } else {
          walker.moving = false;
          walker.timer = 2 + Math.random() * 4;
        }
      }
      const y = groundHeight(layout, walker.x, walker.z);
      walker.billboard.sunYaw = sunYaw;
      walker.billboard.place(walker.x, y, walker.z, billboardYaw(runtime, walker.x, walker.z));
      const walking = walker.moving && !near;
      if (walker.kind === "cat") {
        const { cat } = CHARACTER_SHEET;
        const column = walking
          ? (cat.walk[Math.floor(walker.frameTime * 6) % 2] ?? 0)
          : walker.idle > 6
            ? cat.sleep
            : cat.sit;
        walker.billboard.setFrame(cat.row, column, walker.lastSide < 0);
      } else {
        const personRow = CHARACTER_SHEET.people[walker.kind] + facingRow(walker.facing);
        walker.billboard.setFrame(
          personRow,
          walking ? Math.floor(walker.frameTime * SPRITES.walkFps) % 4 : 0,
        );
      }
    }

    // Birds hop about their spot and fly off when the player comes close.
    const { bird: birdCells } = CHARACTER_SHEET;
    for (const bird of cast.birds) {
      if (bird.flying) {
        bird.flyT = Math.min(1, bird.flyT + delta / 2.2);
        const t = bird.flyT;
        bird.x = bird.flyFrom[0] + (bird.flyTo[0] - bird.flyFrom[0]) * t;
        bird.z = bird.flyFrom[1] + (bird.flyTo[1] - bird.flyFrom[1]) * t;
        const base = groundHeight(layout, bird.x, bird.z);
        bird.y = base + Math.sin(t * Math.PI) * 2.6;
        bird.billboard.setFrame(
          birdCells.row,
          birdCells.fly[Math.floor(time * 10) % 2] ?? 2,
          bird.side < 0,
        );
        if (t >= 1) {
          bird.flying = false;
          bird.hopFrom = [bird.x, bird.z];
          bird.hopTo = [bird.x, bird.z];
        }
      } else {
        if (Math.hypot(bird.x - player.x, bird.z - player.z) < 2.2) {
          const spots = layout.birdSpots;
          bird.spot =
            (bird.spot + 1 + Math.floor(Math.random() * Math.max(1, spots.length - 1))) %
            Math.max(1, spots.length);
          const spot = spots[bird.spot] ?? { x: bird.x, z: bird.z };
          bird.flyFrom = [bird.x, bird.z];
          bird.flyTo = [spot.x + (Math.random() - 0.5), spot.z + (Math.random() - 0.5)];
          bird.flyT = 0;
          bird.flying = true;
          const side =
            (bird.flyTo[0] - bird.x) * camera.rightX + (bird.flyTo[1] - bird.z) * camera.rightZ;
          bird.side = side >= 0 ? 1 : -1;
          continue;
        }
        bird.hopTimer -= delta;
        if (bird.hopT >= 1 && bird.hopTimer <= 0) {
          const spot = layout.birdSpots[bird.spot] ?? { x: bird.x, z: bird.z };
          bird.hopFrom = [bird.x, bird.z];
          bird.hopTo = [spot.x + (Math.random() - 0.5) * 1.2, spot.z + (Math.random() - 0.5) * 1.2];
          bird.hopT = 0;
          bird.hopTimer = 0.4 + Math.random() * 1.2;
          const side =
            (bird.hopTo[0] - bird.x) * camera.rightX + (bird.hopTo[1] - bird.z) * camera.rightZ;
          bird.side = side >= 0 ? 1 : -1;
        }
        if (bird.hopT < 1) {
          bird.hopT = Math.min(1, bird.hopT + delta / 0.3);
          bird.x = bird.hopFrom[0] + (bird.hopTo[0] - bird.hopFrom[0]) * bird.hopT;
          bird.z = bird.hopFrom[1] + (bird.hopTo[1] - bird.hopFrom[1]) * bird.hopT;
        }
        bird.y = groundHeight(layout, bird.x, bird.z) + Math.sin(bird.hopT * Math.PI) * 0.12;
        bird.billboard.setFrame(
          birdCells.row,
          birdCells.hop[bird.hopT < 1 ? 1 : 0] ?? 0,
          bird.side < 0,
        );
      }
      bird.billboard.sunYaw = sunYaw;
      bird.billboard.place(bird.x, bird.y, bird.z, billboardYaw(runtime, bird.x, bird.z));
    }
  });

  return (
    <group>
      {cast.walkers.map((walker) => (
        <group key={walker.billboard.mesh.uuid}>
          <primitive object={walker.billboard.mesh} />
          <primitive object={walker.billboard.blob} />
        </group>
      ))}
      {cast.birds.map((bird) => (
        <group key={bird.billboard.mesh.uuid}>
          <primitive object={bird.billboard.mesh} />
          <primitive object={bird.billboard.blob} />
        </group>
      ))}
    </group>
  );
}
