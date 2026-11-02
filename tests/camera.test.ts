import { describe, expect, it } from "vitest";
import type { CameraTuning } from "@/game/settings/types";
import { CAMERA_TRANSITION, THIRD_PERSON } from "@/game3d/config/camera";
import { HORIZON, SUN, WORLD } from "@/game3d/config/visuals";
import { CameraCollision, rayBox, raySphere } from "@/game3d/systems/camera/CameraCollision";
import {
  CameraModeManager,
  createPose,
  framingDistance,
  posePosition,
} from "@/game3d/systems/camera/CameraModeManager";
import { IsometricRig, ISO_BASE_YAW } from "@/game3d/systems/camera/IsometricRig";
import {
  ThirdPersonRig,
  angleDelta,
  createRigFrame,
  damp,
  type CollisionLike,
} from "@/game3d/systems/camera/ThirdPersonRig";
import { distanceOutside, lakeDepth, outerHeight } from "@/game3d/world/horizon";
import { buildLayout, groundHeight, terrainHeight } from "@/game3d/world/layout";

const DEG = Math.PI / 180;

function tuning(): CameraTuning {
  return {
    fov: THIRD_PERSON.fov,
    armLength: THIRD_PERSON.armLength,
    shoulderOffset: THIRD_PERSON.shoulderOffset,
    positionDamping: THIRD_PERSON.damping.position,
    rotationDamping: THIRD_PERSON.damping.yaw,
    shadowBias: SUN.bias,
    shadowNormalBias: SUN.normalBias,
    showColliders: false,
  };
}

/** Open ground with an optional wall: anything along -x beyond `wallAt` is blocked. */
function world(wallAt = Infinity): CollisionLike {
  return {
    heightAt: () => 0,
    cast: (ox, _oy, _oz, dx, _dy, _dz, maxDistance, radius) => {
      if (dx >= 0 || !Number.isFinite(wallAt)) return maxDistance;
      const t = (ox - wallAt - radius) / -dx;
      return Math.max(0, Math.min(maxDistance, t));
    },
  };
}

describe("camera collision", () => {
  it("hits boxes and spheres grown by the probe radius, and ignores ones it starts inside", () => {
    const box = { minX: 2, minY: 0, minZ: -1, maxX: 3, maxY: 2, maxZ: 1 };
    expect(rayBox(0, 1, 0, 1, 0, 0, box, 0.25)).toBeCloseTo(1.75);
    expect(rayBox(0, 5, 0, 1, 0, 0, box, 0.25)).toBe(-1);
    expect(rayBox(2.5, 1, 0, 1, 0, 0, box, 0)).toBe(-1);
    const sphere = { x: 5, y: 0, z: 0, r: 1 };
    expect(raySphere(0, 0, 0, 1, 0, 0, sphere, 0.5)).toBeCloseTo(3.5);
    expect(raySphere(0, 3, 0, 1, 0, 0, sphere, 0.5)).toBe(-1);
  });

  it("stops the arm at buildings, tree canopies and the ground", () => {
    const layout = buildLayout();
    const collision = new CameraCollision(layout, (x, z) => terrainHeight(layout, x, z));
    collision.setBuildings([{ minX: 10, minY: 0, minZ: 10, maxX: 12, maxY: 3, maxZ: 12 }]);
    expect(collision.cast(8, 1, 11, 1, 0, 0, 6, 0.2, 0)).toBeCloseTo(1.8, 1);
    // Straight down from a little above the ground: stops before the clearance.
    const down = collision.cast(20, 1, 15, 0, -1, 0, 5, 0.2, 0.25);
    expect(down).toBeLessThan(1);
    expect(collision.spheres.length).toBe(layout.trees.length);
  });
});

describe("third-person rig", () => {
  it("clamps pitch to its limits however far the visitor looks", () => {
    const rig = new ThirdPersonRig(tuning());
    const frame = createRigFrame();
    frame.delta = 1 / 60;
    frame.lookPitch = 10;
    for (let i = 0; i < 200; i += 1) rig.update(frame, world());
    expect(rig.pitch).toBeCloseTo(THIRD_PERSON.pitchMax * DEG, 3);
    frame.lookPitch = -10;
    for (let i = 0; i < 200; i += 1) rig.update(frame, world());
    expect(rig.pitch).toBeCloseTo(THIRD_PERSON.pitchMin * DEG, 3);
  });

  it("pulls the arm in at once for a wall, eases back out, and fades the player when close", () => {
    const rig = new ThirdPersonRig(tuning());
    const frame = createRigFrame();
    frame.delta = 1 / 60;
    // Looking along +x puts the camera toward -x (yaw -90°): a wall 0.8 behind the head.
    rig.placeBehind(Math.PI / 2, true);
    rig.update(frame, world(-0.8));
    expect(rig.arm).toBeLessThan(1);
    expect(rig.fade).toBeLessThan(1);
    // The wall goes away: the arm grows back gradually, not in one frame.
    rig.update(frame, world());
    expect(rig.arm).toBeLessThan(THIRD_PERSON.armLength * 0.5);
    for (let i = 0; i < 600; i += 1) rig.update(frame, world());
    expect(rig.arm).toBeCloseTo(THIRD_PERSON.armLength, 2);
    expect(rig.fade).toBe(1);
  });

  it("swings back behind a walking player after the idle delay, unless reduced motion is on", () => {
    const run = (reducedMotion: boolean, idle: number) => {
      const rig = new ThirdPersonRig(tuning());
      const frame = createRigFrame();
      frame.delta = 1 / 60;
      frame.moving = true;
      frame.heading = 0;
      frame.idleLook = idle;
      frame.reducedMotion = reducedMotion;
      rig.placeBehind(0.9, true);
      for (let i = 0; i < 240; i += 1) rig.update(frame, world());
      return Math.abs(angleDelta(rig.yaw, Math.PI));
    };
    const start = Math.abs(angleDelta(0.9 + Math.PI, Math.PI));
    expect(run(false, THIRD_PERSON.recenterDelay + 1)).toBeLessThan(start * 0.2);
    expect(run(false, 0)).toBeCloseTo(start, 3);
    expect(run(true, THIRD_PERSON.recenterDelay + 1)).toBeCloseTo(start, 3);
  });

  it("damps the same at any frame rate", () => {
    const at = (steps: number) => {
      const rig = new ThirdPersonRig(tuning());
      const frame = createRigFrame();
      frame.delta = 0.5 / steps;
      rig.update(frame, world());
      frame.x = 4;
      for (let i = 0; i < steps; i += 1) rig.update(frame, world());
      return rig.pivot.x;
    };
    expect(at(30)).toBeCloseTo(at(240), 6);
    expect(damp(10, 0.1)).toBeCloseTo(1 - Math.exp(-1), 9);
  });
});

describe("camera modes", () => {
  it("blends over the transition time and lands exactly on each pose", () => {
    const modes = new CameraModeManager("isometric");
    expect(modes.perspective).toBe(false);
    modes.setMode("thirdPerson", false);
    modes.update(CAMERA_TRANSITION.seconds / 2);
    expect(modes.transitioning).toBe(true);
    modes.update(CAMERA_TRANSITION.seconds);
    expect(modes.blend).toBe(1);

    const iso = createPose();
    Object.assign(iso, {
      targetX: 20,
      targetY: 1,
      targetZ: 15,
      yaw: ISO_BASE_YAW,
      pitch: 35 * DEG,
      distance: 90,
      fov: 6,
    });
    const third = createPose();
    Object.assign(third, {
      targetX: 19,
      targetY: 1.2,
      targetZ: 14,
      yaw: Math.PI,
      pitch: 24 * DEG,
      distance: 4.4,
      fov: 60,
    });
    const out = createPose();
    modes.mix(iso, third, out);
    expect(out).toEqual(
      expect.objectContaining({
        targetX: 19,
        distance: expect.closeTo(4.4, 6),
        fov: expect.closeTo(60, 6),
      }),
    );
    modes.setMode("isometric", true);
    modes.mix(iso, third, out);
    expect(out.distance).toBeCloseTo(90, 6);
    expect(out.fov).toBeCloseTo(6, 6);
  });

  it("frames the narrow stand-in exactly like the orthographic view", () => {
    const distance = framingDistance(12.5, 6);
    expect(2 * distance * Math.tan(3 * DEG)).toBeCloseTo(12.5, 6);
    const pose = createPose();
    Object.assign(pose, { yaw: 0, pitch: 0, distance: 5 });
    const position = { x: 0, y: 0, z: 0 };
    posePosition(pose, position);
    expect(position).toEqual({ x: 0, y: 0, z: 5 });
  });

  it("leaves third-person on the nearest isometric quarter turn", () => {
    expect(IsometricRig.nearestTurn(ISO_BASE_YAW + 0.3)).toBe(0);
    expect(IsometricRig.nearestTurn(ISO_BASE_YAW + Math.PI / 2 - 0.2)).toBe(1);
    expect(IsometricRig.nearestTurn(ISO_BASE_YAW - Math.PI)).toBe(-2);
  });
});

describe("terrain and horizon", () => {
  it("meets the village's border forest at the map edge and rises into hills and cliffs", () => {
    expect(distanceOutside(10, 10, 40, 30)).toBe(0);
    expect(distanceOutside(-3, 10, 40, 30)).toBe(3);
    expect(outerHeight(-0.01, 12, 40, 30)).toBeCloseTo(WORLD.forestHeight, 1);
    expect(outerHeight(-HORIZON.cliffStart - 6, 12, 40, 30)).toBeGreaterThan(
      WORLD.forestHeight + 4,
    );
  });

  it("sinks the lake below the water line", () => {
    const { x, z } = HORIZON.lake;
    expect(lakeDepth(x, z)).toBeCloseTo(1);
    expect(outerHeight(x, z, 40, 30)).toBeLessThan(WORLD.waterLevel);
    expect(lakeDepth(x + 40, z + 40)).toBe(0);
  });

  it("ramps the feet over tile steps instead of popping", () => {
    const layout = buildLayout();
    // Find a cobble tile with grass (height 0) directly west of it: the plaza's edge.
    let edge: { x: number; z: number } | null = null;
    for (let i = 0; i < layout.width * layout.height && !edge; i += 1) {
      const x = i % layout.width;
      const z = Math.floor(i / layout.width);
      if (layout.village.ground[i] === "cobble" && groundHeight(layout, x - 0.5, z + 0.5) === 0) {
        edge = { x, z };
      }
    }
    expect(edge).not.toBeNull();
    if (!edge) return;
    const at = (x: number) => terrainHeight(layout, x, edge.z + 0.5, 0.22);
    expect(at(edge.x + 0.5)).toBeCloseTo(WORLD.plazaHeight);
    expect(at(edge.x + 0.01)).toBeGreaterThan(0);
    expect(at(edge.x + 0.01)).toBeLessThan(WORLD.plazaHeight);
  });
});
