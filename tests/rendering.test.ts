import { describe, expect, it } from "vitest";
import { QUALITY, QUALITY_TIERS, WORLD } from "@/game3d/config/visuals";
import { buildTerrainGeometry, computeGroundOcclusion } from "@/game3d/scene/terrainGeometry";
import { QualityManager } from "@/game3d/settings/QualityManager";
import { computeShoreDistance } from "@/game3d/shaders/water";
import { InputController } from "@/game3d/systems/input";
import { buildLayout } from "@/game3d/world/layout";
import type { QualityLevel, QualitySetting } from "@/game/settings/types";
import { defaultQualityFor } from "@/lib/settings";

const layout = buildLayout();

describe("quality tiers", () => {
  it("match the documented tiers", () => {
    expect(QUALITY_TIERS.low).toMatchObject({
      maxDpr: 1,
      sunShadows: false,
      post: false,
      reflections: false,
      weather: "off",
    });
    expect(QUALITY_TIERS.medium).toMatchObject({
      sunShadows: true,
      shadowMapSize: 1024,
      post: true,
      reflections: false,
      weather: "light",
    });
    expect(QUALITY_TIERS.high).toMatchObject({
      maxDpr: 2,
      shadowMapSize: 2048,
      ssao: true,
      tiltShift: true,
      reflections: true,
      shafts: true,
      cones: true,
      weather: "full",
    });
  });

  it("defaults to Low on touch, reduced-motion and low-power devices", () => {
    const none = { touch: false, reducedMotion: false, lowPower: false };
    expect(defaultQualityFor(none)).toBe("auto");
    expect(defaultQualityFor({ ...none, touch: true })).toBe("low");
    expect(defaultQualityFor({ ...none, reducedMotion: true })).toBe("low");
    expect(defaultQualityFor({ ...none, lowPower: true })).toBe("low");
  });
});

describe("quality manager", () => {
  function track(setting: QualitySetting) {
    const changes: QualityLevel[] = [];
    const manager = new QualityManager(setting, (level) => changes.push(level));
    return { manager, changes };
  }

  function frames(manager: QualityManager, fps: number, seconds: number): boolean {
    let offered = false;
    for (let i = 0; i < fps * seconds; i += 1) offered = manager.sampleFrame(1 / fps) || offered;
    return offered;
  }

  it("steps Auto up and down one tier at a time within the range", () => {
    const { manager, changes } = track("auto");
    expect(manager.level).toBe(QUALITY.autoStart);
    manager.incline();
    manager.incline();
    expect(manager.level).toBe("high");
    manager.decline();
    manager.decline();
    manager.decline();
    expect(manager.level).toBe("low");
    expect(changes).toEqual(["high", "medium", "low"]);
  });

  it("ignores the monitor for fixed settings", () => {
    const { manager, changes } = track("medium");
    manager.incline();
    manager.decline();
    expect(manager.level).toBe("medium");
    expect(changes).toEqual([]);
    manager.setSetting("auto");
    expect(changes).toEqual([QUALITY.autoStart]);
  });

  it("offers the plain view once after sustained slowness on Low", () => {
    const { manager } = track("low");
    expect(frames(manager, 24, QUALITY.lowFpsSeconds - 1)).toBe(false);
    expect(frames(manager, 24, 2)).toBe(true);
    expect(frames(manager, 24, 10)).toBe(false);
  });

  it("treats stalls as stalls, and fast frames as fine", () => {
    const { manager } = track("low");
    for (let second = 0; second < 20; second += 1) {
      frames(manager, 60, 1);
      manager.sampleFrame(2);
    }
    expect(frames(manager, 60, 10)).toBe(false);
    const medium = track("medium").manager;
    expect(frames(medium, 20, 20)).toBe(false);
  });
});

describe("water", () => {
  const shore = computeShoreDistance(layout);
  const resolution = 8;
  const width = layout.width * resolution;
  const at = (x: number, z: number) =>
    shore[Math.floor(z * resolution) * width + Math.floor(x * resolution)] ?? 0;

  it("is zero on land and grows away from the banks", () => {
    const pond = layout.village.ground.findIndex((ground) => ground === "water");
    const land = layout.village.ground.findIndex((ground) => ground === "grass");
    expect(at((land % layout.width) + 0.5, Math.floor(land / layout.width) + 0.5)).toBe(0);
    let deepest = 0;
    layout.village.ground.forEach((ground, index) => {
      if (ground === "water")
        deepest = Math.max(
          deepest,
          at((index % layout.width) + 0.5, Math.floor(index / layout.width) + 0.5),
        );
    });
    expect(pond).toBeGreaterThanOrEqual(0);
    expect(deepest).toBeGreaterThan(128);
  });
});

describe("terrain", () => {
  it("builds a top face for every dry tile and sides wherever the ground steps down", () => {
    const geometry = buildTerrainGeometry(layout);
    const dry = layout.village.ground.filter(
      (ground) => ground !== "water" && ground !== "bridge",
    ).length;
    expect(geometry.top.getAttribute("position").count).toBe(dry * 6);
    expect(geometry.top.getAttribute("uv1").count).toBe(dry * 6);
    expect(geometry.kerb.getAttribute("position").count).toBeGreaterThan(0);
    expect(geometry.bank.getAttribute("position").count).toBeGreaterThan(0);
    // The diorama skirt drops to the base on every outer edge.
    const positions = geometry.earth.getAttribute("position");
    let lowest = 0;
    for (let i = 0; i < positions.count; i += 1) lowest = Math.min(lowest, positions.getY(i));
    expect(lowest).toBeCloseTo(-WORLD.baseDepth);
    Object.values(geometry).forEach((part) => part.dispose());
  });

  it("darkens the ground around buildings more than open grass", () => {
    const resolution = 4;
    const occlusion = computeGroundOcclusion(layout, resolution);
    const w = layout.width * resolution;
    const sample = (x: number, z: number) =>
      occlusion[Math.floor(z * resolution) * w + Math.floor(x * resolution)] ?? 0;
    const home = layout.buildings.find((building) => building.id === "home");
    expect(home).toBeDefined();
    if (!home) return;
    const besideWall = sample(home.rect.x - 0.2, home.rect.y + 1.5);
    const openGrass = sample(28.5, 9.5);
    expect(besideWall).toBeLessThan(openGrass);
  });
});

describe("input", () => {
  it("turns the D-pad and joystick into camera-relative movement", () => {
    const input = new InputController();
    input.setDpad(0, -1);
    input.update(1 / 60);
    expect(input.actions.move).toEqual({ x: 0, y: 1 });
    input.setDpad(1, 1);
    input.update(1 / 60);
    expect(input.actions.move.x).toBeCloseTo(Math.SQRT1_2);
    expect(input.actions.move.y).toBeCloseTo(-Math.SQRT1_2);
    input.reset();
    input.setJoystick(0.3, 0.4);
    input.update(1 / 60);
    expect(input.actions.move.x).toBeCloseTo(0.3);
    expect(input.actions.move.y).toBeCloseTo(0.4);
    input.reset();
    input.update(1 / 60);
    expect(input.actions.move).toEqual({ x: 0, y: 0 });
  });

  it("queues interactions, turns, camera resets and taps until consumed", () => {
    const input = new InputController();
    input.queueInteract();
    input.queueTurn(1);
    input.queueResetCamera();
    input.queueTap({ tileX: 3, tileZ: 4, buildingIndex: -1 });
    expect(input.consumeInteract()).toBe(true);
    expect(input.consumeInteract()).toBe(false);
    expect(input.consumeTurn()).toBe(1);
    expect(input.consumeTurn()).toBe(0);
    expect(input.consumeResetCamera()).toBe(true);
    expect(input.consumeResetCamera()).toBe(false);
    expect(input.consumeTap()).toEqual({ tileX: 3, tileZ: 4, buildingIndex: -1 });
    expect(input.consumeTap()).toBeNull();
  });

  it("only looks around in third-person, and counts time without look input", () => {
    const input = new InputController();
    input.update(0.5);
    expect(input.actions.look).toEqual({ yaw: 0, pitch: 0 });
    expect(input.idleLook).toBeCloseTo(0.5);
    input.setMode("thirdPerson");
    input.look.mouse.x = 100;
    input.update(1 / 60);
    expect(input.actions.look.yaw).toBeLessThan(0);
    expect(input.idleLook).toBe(0);
  });
});
