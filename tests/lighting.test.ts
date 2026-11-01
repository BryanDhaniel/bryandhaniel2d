import { describe, expect, it } from "vitest";
import { DAY_CYCLE, SUN } from "@/game/config/visuals";
import { DayNightCycle, lightsOnAt, sunPose, wrapTime } from "@/game/lighting/DayNightCycle";
import { NORMAL_PRESETS, computeNormalMap } from "@/game/lighting/normalMaps";
import { shadowGeometry, type ShadowGeometry } from "@/game/shadows/bake";

const stateAt = (t: number) => new DayNightCycle("auto", false, t).state;
const sum = (values: Float32Array) => values.reduce((total, value) => total + value, 0);

describe("day/night cycle", () => {
  it("wraps times into [0, 1)", () => {
    expect(wrapTime(1.25)).toBeCloseTo(0.25);
    expect(wrapTime(-0.25)).toBeCloseTo(0.75);
    expect(wrapTime(0)).toBe(0);
  });

  it("names the phases through the day", () => {
    expect(stateAt(0.1).phase).toBe("Night");
    expect(stateAt(0.27).phase).toBe("Dawn");
    expect(stateAt(0.5).phase).toBe("Day");
    expect(stateAt(0.76).phase).toBe("Dusk");
    expect(stateAt(0.9).phase).toBe("Night");
  });

  it("is brighter at noon than at midnight", () => {
    expect(sum(stateAt(0.5).ambient)).toBeGreaterThan(sum(stateAt(0).ambient) + 0.5);
  });

  it("fades the lamps on over dusk and off over dawn", () => {
    expect(lightsOnAt(0.5)).toBe(0);
    expect(lightsOnAt(0)).toBe(1);
    expect(lightsOnAt(0.9)).toBe(1);
    expect(lightsOnAt((DAY_CYCLE.lightsOnStart + DAY_CYCLE.lightsOnEnd) / 2)).toBeCloseTo(0.5);
    expect(lightsOnAt((DAY_CYCLE.lightsOffStart + DAY_CYCLE.lightsOffEnd) / 2)).toBeCloseTo(0.5);
    let previous = 0;
    for (let t = DAY_CYCLE.lightsOnStart; t <= DAY_CYCLE.lightsOnEnd; t += 0.002) {
      const value = lightsOnAt(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("casts sun shadows only while the sun is up", () => {
    const noon = stateAt(0.5);
    expect(noon.shadowAlpha).toBeCloseTo(SUN.maxAlpha);
    expect(noon.shadowStep).toBe((SUN.steps - 1) / 2);
    expect(noon.daylight).toBeGreaterThan(0.9);
    const night = stateAt(0.05);
    expect(night.shadowAlpha).toBe(0);
    expect(night.daylight).toBe(0);
    expect(stateAt(SUN.rise + 0.001).shadowStep).toBe(0);
    expect(stateAt(SUN.set - 0.001).shadowStep).toBe(SUN.steps - 1);
  });

  it("holds the clock in the fixed modes", () => {
    const cycle = new DayNightCycle("night", false);
    expect(cycle.state.t).toBe(DAY_CYCLE.nightTime);
    expect(cycle.state.lightsOn).toBe(1);
    cycle.update(60_000);
    expect(cycle.state.t).toBe(DAY_CYCLE.nightTime);
  });

  it("fast-forwards to a fixed mode, or jumps straight there with reduced motion", () => {
    const cycle = new DayNightCycle("auto", false, DAY_CYCLE.dayTime);
    cycle.setMode("night");
    cycle.update(100);
    expect(cycle.state.t).toBeGreaterThan(DAY_CYCLE.dayTime);
    expect(cycle.state.t).toBeLessThan(DAY_CYCLE.nightTime);
    for (let frame = 0; frame < 200; frame += 1) cycle.update(16);
    expect(cycle.state.t).toBe(DAY_CYCLE.nightTime);

    const reduced = new DayNightCycle("auto", true, DAY_CYCLE.dayTime);
    reduced.setMode("night");
    expect(reduced.state.t).toBe(DAY_CYCLE.nightTime);
    expect(reduced.state.phase).toBe("Night");
  });

  it("loops a full day in auto mode, updating its state in place", () => {
    const cycle = new DayNightCycle("auto", false, 0.3);
    const ambient = cycle.state.ambient;
    const frames = 480;
    for (let frame = 0; frame < frames; frame += 1) {
      cycle.update((DAY_CYCLE.lengthSeconds * 1000) / frames);
    }
    expect(cycle.state.t).toBeCloseTo(0.3, 6);
    expect(cycle.state.ambient).toBe(ambient);
  });
});

describe("sun shadows", () => {
  it("lean from west to east through the day and are shortest at noon", () => {
    const sunrise = sunPose(0);
    const noon = sunPose((SUN.steps - 1) / 2);
    const sunset = sunPose(SUN.steps - 1);
    expect(sunrise.shear).toBeCloseTo(-SUN.maxShear);
    expect(sunset.shear).toBeCloseTo(SUN.maxShear);
    expect(noon.shear).toBeCloseTo(0);
    expect(noon.length).toBeCloseTo(SUN.minLength);
    expect(sunrise.length).toBeCloseTo(SUN.maxLength);
    expect(sunset.length).toBeCloseTo(sunrise.length);
  });

  it("keeps every projected silhouette inside its baked frame", () => {
    const width = 40;
    const height = 56;
    for (let step = 0; step < SUN.steps; step += 1) {
      const geometry = shadowGeometry(width, height, sunPose(step));
      const [a, b, c, d, e, f] = geometry.matrix;
      const project = (x: number, y: number) => [a * x + c * y + e, b * x + d * y + f] as const;
      for (const [x, y] of [
        [0, 0],
        [width, 0],
        [0, height],
        [width, height],
      ] as const) {
        const [px, py] = project(x, y);
        expect(px).toBeGreaterThanOrEqual(-1e-9);
        expect(px).toBeLessThanOrEqual(geometry.width + 1e-9);
        expect(py).toBeGreaterThanOrEqual(-1e-9);
        expect(py).toBeLessThanOrEqual(geometry.height + 1e-9);
      }
      // The caster's base stays where it stands: its bottom-left corner lands on the anchor
      // (within a pixel, since the frame height rounds up).
      const [baseX, baseY] = project(0, height);
      expect(baseX).toBeCloseTo(geometry.anchorX);
      expect(Math.abs(baseY - geometry.anchorY)).toBeLessThan(1);
    }
  });

  it("throws morning shadows west and evening shadows east", () => {
    // The caster's top-left corner (0, 0) lands at x = e.
    const tipX = (geometry: ShadowGeometry) => geometry.matrix[4];
    const morning = shadowGeometry(10, 30, sunPose(0));
    const evening = shadowGeometry(10, 30, sunPose(SUN.steps - 1));
    expect(tipX(morning)).toBeLessThan(morning.anchorX);
    expect(tipX(evening)).toBeGreaterThan(evening.anchorX);
    expect(morning.width).toBe(evening.width);
  });
});

describe("normal maps", () => {
  const FLAT = [128, 128, 255, 255];

  function image(
    width: number,
    height: number,
    paint: (x: number, y: number) => readonly [number, number, number, number],
  ): Uint8ClampedArray {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        pixels.set(paint(x, y), (y * width + x) * 4);
      }
    }
    return pixels;
  }

  function rgba(data: Uint8ClampedArray, width: number, x: number, y: number): number[] {
    const index = (y * width + x) * 4;
    return Array.from(data.subarray(index, index + 4));
  }

  // An opaque 9x9 square inside an 11x11 sprite.
  const SIZE = 11;
  const square = image(SIZE, SIZE, (x, y) =>
    x >= 1 && x <= 9 && y >= 1 && y <= 9 ? [120, 120, 120, 255] : [0, 0, 0, 0],
  );

  it("points transparent pixels straight at the viewer", () => {
    const normals = computeNormalMap(square, SIZE, SIZE, NORMAL_PRESETS.sprites);
    expect(normals).toHaveLength(SIZE * SIZE * 4);
    expect(rgba(normals, SIZE, 0, 0)).toEqual(FLAT);
    expect(rgba(normals, SIZE, 10, 5)).toEqual(FLAT);
  });

  it("bevels sprite edges outward, green-up like Laigter's default export", () => {
    const options = { ...NORMAL_PRESETS.sprites, greenUp: true };
    const normals = computeNormalMap(square, SIZE, SIZE, options);
    const [leftRed] = rgba(normals, SIZE, 1, 5);
    const [rightRed] = rgba(normals, SIZE, 9, 5);
    const [, topGreen] = rgba(normals, SIZE, 5, 1);
    const [, bottomGreen] = rgba(normals, SIZE, 5, 9);
    expect(leftRed).toBeLessThan(128);
    expect(rightRed).toBeGreaterThan(128);
    expect(topGreen).toBeGreaterThan(128);
    expect(bottomGreen).toBeLessThan(128);
    expect(rgba(normals, SIZE, 5, 5)).toEqual(FLAT);

    const greenDown = computeNormalMap(square, SIZE, SIZE, { ...options, greenUp: false });
    const [, flippedTop] = rgba(greenDown, SIZE, 5, 1);
    expect(flippedTop).toBeLessThan(128);
  });

  it("keeps tileset cells from bleeding into their neighbours", () => {
    // Two 16x16 tiles side by side: black on the left, white on the right.
    const tiles = image(32, 16, (x) => (x < 16 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const clamped = computeNormalMap(tiles, 32, 16, NORMAL_PRESETS.tiles);
    expect(rgba(clamped, 32, 15, 8)).toEqual(FLAT);
    expect(rgba(clamped, 32, 16, 8)).toEqual(FLAT);
    const bleeding = computeNormalMap(tiles, 32, 16, { ...NORMAL_PRESETS.tiles, cell: 0 });
    expect(rgba(bleeding, 32, 15, 8)).not.toEqual(FLAT);
  });
});
