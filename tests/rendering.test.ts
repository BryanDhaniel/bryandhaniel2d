import { describe, expect, it } from "vitest";
import { QUALITY, RENDER, WATER } from "@/game/config/visuals";
import { tileLayer } from "@/game/map/navigation";
import { LAYER, buildTiledMap, isWaterGid } from "@/game/map/tiled";
import { QUALITY_FEATURES, QualityManager } from "@/game/settings/QualityManager";
import type { QualityLevel, QualitySetting } from "@/game/settings/types";
import { computeLayout } from "@/game/systems/viewport";
import { computeWaterMask } from "@/game/systems/waterMask";
import { defaultQualityFor } from "@/lib/settings";

describe("viewport layout", () => {
  it("shows 320x180 world pixels on a 1080p screen", () => {
    expect(computeLayout(1920, 1080, 1)).toMatchObject({
      zoom: 6,
      viewWidth: 320,
      viewHeight: 180,
      canvasWidth: 320 + RENDER.cameraMargin * 2,
      canvasHeight: 180 + RENDER.cameraMargin * 2,
      windowLeft: 0,
      windowTop: 0,
      windowWidth: 1920,
      windowHeight: 1080,
    });
  });

  it("fills a phone held upright", () => {
    expect(computeLayout(360, 740, 2)).toMatchObject({
      zoom: 4,
      viewWidth: 180,
      viewHeight: 370,
      windowWidth: 360,
      windowHeight: 740,
    });
  });

  it("letterboxes very wide screens instead of showing more of the world", () => {
    const layout = computeLayout(3840, 1080, 1);
    expect(layout.viewWidth).toBe(RENDER.maxViewWidth);
    expect(layout.windowWidth).toBe(RENDER.maxViewWidth * layout.zoom);
    expect(layout.windowLeft).toBe((3840 - layout.windowWidth) / 2);
  });

  it("always scales by a whole number of device pixels and covers the window", () => {
    const screens = [
      [1366, 768, 1],
      [1440, 900, 2],
      [390, 844, 3],
      [1280, 720, 1.25],
      [2560, 1440, 1.5],
      [200, 120, 1],
    ] as const;
    for (const [width, height, ratio] of screens) {
      const layout = computeLayout(width, height, ratio);
      expect(Number.isInteger(layout.zoom)).toBe(true);
      expect(layout.zoom).toBeGreaterThanOrEqual(1);
      expect(layout.viewWidth * layout.zoom).toBeGreaterThanOrEqual(
        Math.round(layout.windowWidth * layout.ratio),
      );
      expect(layout.viewHeight * layout.zoom).toBeGreaterThanOrEqual(
        Math.round(layout.windowHeight * layout.ratio),
      );
      expect(layout.canvasWidth).toBe(layout.viewWidth + layout.margin * 2);
    }
  });
});

describe("quality manager", () => {
  function track(setting: QualitySetting) {
    const changes: QualityLevel[] = [];
    const manager = new QualityManager(setting, (level) => changes.push(level));
    return { manager, changes };
  }

  function feed(manager: QualityManager, frameMs: number, totalMs: number): void {
    for (let elapsed = 0; elapsed < totalMs; elapsed += frameMs) {
      manager.sample(frameMs);
    }
  }

  const FIRST_VERDICT_MS = QUALITY.auto.warmupMs + QUALITY.auto.windowMs + 100;

  it("maps each level to its features", () => {
    expect(QUALITY_FEATURES.low).toMatchObject({
      lighting: false,
      postFx: false,
      shadows: "blob",
      reflections: false,
      weather: false,
    });
    expect(QUALITY_FEATURES.medium).toMatchObject({
      lighting: true,
      postFx: true,
      shadows: "full",
      reflections: false,
      weather: false,
    });
    expect(
      Object.values(QUALITY_FEATURES.high).every((value) => value === true || value === "full"),
    ).toBe(true);
  });

  it("starts Auto at High and steps down one level per slow window", () => {
    const { manager, changes } = track("auto");
    expect(manager.level).toBe("high");
    feed(manager, 40, FIRST_VERDICT_MS);
    expect(changes).toEqual(["medium"]);
    feed(manager, 40, 10_000);
    expect(changes).toEqual(["medium", "low"]);
    feed(manager, 40, 10_000);
    expect(manager.level).toBe("low");
    expect(changes).toHaveLength(2);
  });

  it("keeps High at a steady 60 FPS, then stops measuring", () => {
    const { manager, changes } = track("auto");
    const settleMs =
      QUALITY.auto.warmupMs + QUALITY.auto.windowMs * QUALITY.auto.stableWindows + 500;
    feed(manager, 1000 / 60, settleMs);
    feed(manager, 40, 20_000);
    expect(manager.level).toBe("high");
    expect(changes).toEqual([]);
  });

  it("treats stalls such as a hidden tab as stalls, not slowness", () => {
    const { manager, changes } = track("auto");
    feed(manager, QUALITY.auto.stallMs + 50, 30_000);
    expect(changes).toEqual([]);
    for (let burst = 0; burst < 10; burst += 1) {
      feed(manager, 1000 / 60, 3000);
      manager.sample(500);
    }
    expect(changes).toEqual([]);
  });

  it("leaves fixed levels alone and restarts at High when switched to Auto", () => {
    const { manager, changes } = track("medium");
    feed(manager, 40, 20_000);
    expect(manager.level).toBe("medium");
    expect(changes).toEqual([]);
    manager.setSetting("auto");
    expect(manager.level).toBe("high");
    feed(manager, 40, FIRST_VERDICT_MS);
    expect(changes).toEqual(["high", "medium"]);
  });

  it("defaults to Low on touch, reduced-motion and low-power devices", () => {
    const none = { touch: false, reducedMotion: false, lowPower: false };
    expect(defaultQualityFor(none)).toBe("auto");
    expect(defaultQualityFor({ ...none, touch: true })).toBe("low");
    expect(defaultQualityFor({ ...none, reducedMotion: true })).toBe("low");
    expect(defaultQualityFor({ ...none, lowPower: true })).toBe("low");
  });
});

describe("water mask", () => {
  const map = buildTiledMap();
  const mask = computeWaterMask(map);
  const ground = tileLayer(map, LAYER.ground)?.data ?? [];
  const isWater = (tx: number, ty: number) =>
    tx >= 0 &&
    ty >= 0 &&
    tx < map.width &&
    ty < map.height &&
    isWaterGid(ground[ty * map.width + tx] ?? 0);
  const texel = (x: number, y: number) => (y * mask.width + x) * 4;

  it("covers the world at one texel per pixel, fully opaque", () => {
    expect(mask.width).toBe(map.width * map.tilewidth);
    expect(mask.height).toBe(map.height * map.tileheight);
    expect(mask.data).toHaveLength(mask.width * mask.height * 4);
    expect(mask.data.every((value, index) => index % 4 !== 3 || value === 255)).toBe(true);
  });

  it("marks exactly the water tiles", () => {
    const wrong: string[] = [];
    for (let ty = 0; ty < map.height; ty += 1) {
      for (let tx = 0; tx < map.width; tx += 1) {
        const centre = texel(tx * map.tilewidth + 8, ty * map.tileheight + 8);
        if ((mask.data[centre] === 255) !== isWater(tx, ty)) wrong.push(`${tx},${ty}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("insets the shoreline and measures depth below it for reflections", () => {
    let shores = 0;
    for (let ty = 1; ty < map.height; ty += 1) {
      for (let tx = 0; tx < map.width; tx += 1) {
        if (!isWater(tx, ty) || isWater(tx, ty - 1)) continue;
        shores += 1;
        const x = tx * map.tilewidth + 8;
        const top = ty * map.tileheight;
        for (let y = 0; y < WATER.shoreInset; y += 1) {
          expect(mask.data[texel(x, top + y)]).toBe(0);
        }
        const shoreline = texel(x, top + WATER.shoreInset);
        expect(mask.data[shoreline]).toBe(255);
        expect(mask.data[shoreline + 1]).toBe(0);
        expect(mask.data[texel(x, top + WATER.shoreInset + 4) + 1]).toBe(4);
      }
    }
    expect(shores).toBeGreaterThan(0);
  });

  it("scatters the same puddles on the paths every time", () => {
    let puddle = 0;
    for (let i = 2; i < mask.data.length; i += 4) {
      if (mask.data[i] === 255) puddle += 1;
    }
    expect(puddle).toBeGreaterThan(WATER.puddles * 5);
    expect(computeWaterMask(map).data).toEqual(mask.data);
  });
});
