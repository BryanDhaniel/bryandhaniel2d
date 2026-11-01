import { describe, expect, it } from "vitest";
import { DAY_CYCLE, GRADES } from "@/game3d/config/visuals";
import {
  DayNightCycle,
  directionFrom,
  lightsOnAt,
  linearRgb,
  srgbToLinear,
  wrapTime,
} from "@/game3d/lighting/DayNightCycle";
import { generateLut } from "@/game3d/post/lut";
import { tileableNoise } from "@/game3d/textures/noise";

const stateAt = (t: number) => new DayNightCycle("auto", false, t).state;
const sum = (values: Float32Array) => values.reduce((total, value) => total + value, 0);

describe("day/night cycle", () => {
  it("wraps times into [0, 1)", () => {
    expect(wrapTime(1.25)).toBeCloseTo(0.25);
    expect(wrapTime(-0.25)).toBeCloseTo(0.75);
  });

  it("names the phases through the day", () => {
    expect(stateAt(0.1).phase).toBe("Night");
    expect(stateAt(0.27).phase).toBe("Dawn");
    expect(stateAt(0.5).phase).toBe("Day");
    expect(stateAt(0.76).phase).toBe("Dusk");
    expect(stateAt(0.9).phase).toBe("Night");
  });

  it("lights the day more brightly than the night, and exposes the night more", () => {
    const noon = stateAt(0.5);
    const midnight = stateAt(0);
    expect(noon.sunIntensity).toBeGreaterThan(midnight.sunIntensity * 3);
    expect(sum(noon.skyTop)).toBeGreaterThan(sum(midnight.skyTop));
    expect(midnight.exposure).toBeGreaterThan(noon.exposure);
    expect(midnight.stars).toBeGreaterThan(0.9);
    expect(noon.stars).toBe(0);
  });

  it("keeps the sun south at noon and above the minimum elevation all day", () => {
    const noon = stateAt(0.5).sunDirection;
    expect(noon[2]).toBeGreaterThan(0.3);
    const minY = Math.sin((DAY_CYCLE.minElevation * Math.PI) / 180);
    for (let t = 0; t < 1; t += 0.01) {
      const direction = stateAt(t).sunDirection;
      expect(direction[1]).toBeGreaterThanOrEqual(minY - 1e-6);
      expect(Math.hypot(direction[0] ?? 0, direction[1] ?? 0, direction[2] ?? 0)).toBeCloseTo(1, 5);
    }
  });

  it("fades the lamps on over dusk and off over dawn", () => {
    expect(lightsOnAt(0.5)).toBe(0);
    expect(lightsOnAt(0)).toBe(1);
    expect(lightsOnAt((DAY_CYCLE.lightsOnStart + DAY_CYCLE.lightsOnEnd) / 2)).toBeCloseTo(0.5);
    expect(lightsOnAt((DAY_CYCLE.lightsOffStart + DAY_CYCLE.lightsOffEnd) / 2)).toBeCloseTo(0.5);
  });

  it("blends neighbouring colour grades", () => {
    const dusk = stateAt(0.76);
    expect(dusk.gradeMix).toBeGreaterThan(0);
    expect(dusk.gradeMix).toBeLessThan(1);
  });

  it("holds the clock in fixed modes and fast-forwards to them", () => {
    const fixed = new DayNightCycle("night", false);
    fixed.update(60);
    expect(fixed.state.t).toBe(DAY_CYCLE.nightTime);
    const cycle = new DayNightCycle("auto", false, DAY_CYCLE.dayTime);
    cycle.setMode("night");
    cycle.update(0.1);
    expect(cycle.state.t).toBeGreaterThan(DAY_CYCLE.dayTime);
    expect(cycle.state.t).toBeLessThan(DAY_CYCLE.nightTime);
    for (let frame = 0; frame < 300; frame += 1) cycle.update(1 / 60);
    expect(cycle.state.t).toBe(DAY_CYCLE.nightTime);
    const reduced = new DayNightCycle("auto", true, DAY_CYCLE.dayTime);
    reduced.setMode("night");
    expect(reduced.state.t).toBe(DAY_CYCLE.nightTime);
  });

  it("loops a full day in auto mode, updating its state in place", () => {
    const cycle = new DayNightCycle("auto", false, 0.3);
    const sky = cycle.state.skyTop;
    for (let frame = 0; frame < 480; frame += 1) cycle.update(DAY_CYCLE.lengthSeconds / 480);
    expect(cycle.state.t).toBeCloseTo(0.3, 6);
    expect(cycle.state.skyTop).toBe(sky);
  });
});

describe("colour helpers", () => {
  it("converts palette colours to linear light", () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214, 3);
    const [r, g, b] = linearRgb("cloud");
    expect(Math.min(r, g, b)).toBeGreaterThan(0.75);
  });

  it("points east at azimuth 90 and south at 180", () => {
    const [ex, , ez] = directionFrom(0, 90);
    expect(ex).toBeCloseTo(1);
    expect(ez).toBeCloseTo(0);
    const [sx, , sz] = directionFrom(0, 180);
    expect(sx).toBeCloseTo(0);
    expect(sz).toBeCloseTo(1);
  });
});

describe("colour grades", () => {
  const SIZE = 8;
  const at = (lut: Uint8Array, r: number, g: number, b: number) => {
    const i = ((b * SIZE + g) * SIZE + r) * 4;
    return [lut[i] ?? 0, lut[i + 1] ?? 0, lut[i + 2] ?? 0];
  };

  it("leaves colours alone with a neutral grade", () => {
    const neutral = generateLut(
      {
        temperature: 0,
        saturation: 1,
        contrast: 1,
        lift: { color: "ink", amount: 0 },
        gain: { color: "cloud", amount: 0 },
      },
      SIZE,
    );
    expect(at(neutral, 0, 0, 0)).toEqual([0, 0, 0]);
    expect(at(neutral, 7, 7, 7)).toEqual([255, 255, 255]);
    const [r, g, b] = at(neutral, 3, 5, 2);
    expect(r).toBeCloseTo((3 / 7) * 255, -1);
    expect(g).toBeCloseTo((5 / 7) * 255, -1);
    expect(b).toBeCloseTo((2 / 7) * 255, -1);
  });

  it("warms dusk and cools the night", () => {
    const grey = (lut: Uint8Array) => at(lut, 4, 4, 4);
    const [duskR, , duskB] = grey(generateLut(GRADES.dusk, SIZE));
    const [nightR, , nightB] = grey(generateLut(GRADES.night, SIZE));
    expect(duskR).toBeGreaterThan(duskB);
    expect(nightB).toBeGreaterThan(nightR);
  });
});

describe("noise", () => {
  it("tiles seamlessly and is deterministic", () => {
    const size = 32;
    const noise = tileableNoise(size, 4, 5);
    expect(noise).toEqual(tileableNoise(size, 4, 5));
    // The last column flows into the first: neighbours across the seam stay close.
    for (let y = 0; y < size; y += 1) {
      const left = noise[y * size] ?? 0;
      const right = noise[y * size + size - 1] ?? 0;
      expect(Math.abs(left - right)).toBeLessThan(40);
    }
  });
});
