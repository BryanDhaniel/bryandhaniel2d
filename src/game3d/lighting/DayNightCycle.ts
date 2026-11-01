import { PALETTE, type PaletteName } from "@/game/palette";
import type { DayPhase, TimeMode } from "@/game/settings/types";
import {
  DAY_CYCLE,
  GRADE_NAMES,
  TIME_KEYFRAMES,
  type LightingKeyframe,
} from "@/game3d/config/visuals";

/**
 * The time of day. `update()` advances the clock and re-evaluates `state` from the lighting
 * keyframes without allocating, so the renderer can read it every frame. Colours are linear
 * RGB (the renderer's working space); the palette's hex values are sRGB.
 */
export interface CycleState {
  /** Time of day in [0, 1): 0 midnight, 0.5 noon. */
  t: number;
  phase: DayPhase;
  /** Unit vector from the ground toward the key light (sun or moon). */
  readonly sunDirection: Float32Array;
  readonly sunColor: Float32Array;
  sunIntensity: number;
  readonly hemiSky: Float32Array;
  readonly hemiGround: Float32Array;
  hemiIntensity: number;
  readonly skyTop: Float32Array;
  readonly skyHorizon: Float32Array;
  readonly fogColor: Float32Array;
  fogDensity: number;
  exposure: number;
  environment: number;
  /** The two colour grades to blend and how far between them (0 = gradeA). */
  gradeA: number;
  gradeB: number;
  gradeMix: number;
  bloom: number;
  clouds: number;
  shafts: number;
  stars: number;
  /** 0 by day, 1 at night; fades at dusk and dawn. Drives lamps and lit windows. */
  lightsOn: number;
  /** 0 at night, 1 with the sun high. */
  daylight: number;
}

const RISE = 0.25;
const SET = 0.77;

export function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Palette colour as linear RGB, optionally scaled. */
export function linearRgb(name: PaletteName, scale = 1): [number, number, number] {
  const value = Number.parseInt(PALETTE[name].slice(1), 16);
  return [
    srgbToLinear(((value >> 16) & 255) / 255) * scale,
    srgbToLinear(((value >> 8) & 255) / 255) * scale,
    srgbToLinear((value & 255) / 255) * scale,
  ];
}

/** Direction toward a light at the given elevation and compass azimuth (90 east, 180 south). */
export function directionFrom(elevation: number, azimuth: number): [number, number, number] {
  const el = (elevation * Math.PI) / 180;
  const az = (azimuth * Math.PI) / 180;
  return [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)];
}

interface ResolvedKeyframe {
  frame: LightingKeyframe;
  sun: [number, number, number];
  sunColor: [number, number, number];
  hemiSky: [number, number, number];
  hemiGround: [number, number, number];
  skyTop: [number, number, number];
  skyHorizon: [number, number, number];
  fog: [number, number, number];
  grade: number;
}

const RESOLVED: readonly ResolvedKeyframe[] = TIME_KEYFRAMES.map((frame) => ({
  frame,
  sun: directionFrom(frame.sun.elevation, frame.sun.azimuth),
  sunColor: linearRgb(frame.sun.color),
  hemiSky: linearRgb(frame.hemisphere.sky),
  hemiGround: linearRgb(frame.hemisphere.ground),
  skyTop: linearRgb(frame.sky.top),
  skyHorizon: linearRgb(frame.sky.horizon),
  fog: linearRgb(frame.fog.color),
  grade: GRADE_NAMES.indexOf(frame.grade),
}));

function smooth(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

export function wrapTime(t: number): number {
  return ((t % 1) + 1) % 1;
}

/** Lamps fade on over the dusk window and off over the dawn window. */
export function lightsOnAt(t: number): number {
  const { lightsOnStart, lightsOnEnd, lightsOffStart, lightsOffEnd } = DAY_CYCLE;
  if (t >= lightsOnEnd || t < lightsOffStart) return 1;
  if (t < lightsOffEnd) return 1 - smooth((t - lightsOffStart) / (lightsOffEnd - lightsOffStart));
  if (t >= lightsOnStart) return smooth((t - lightsOnStart) / (lightsOnEnd - lightsOnStart));
  return 0;
}

function mixInto(
  out: Float32Array,
  a: readonly number[],
  b: readonly number[],
  k: number,
  scale = 1,
): void {
  for (let c = 0; c < 3; c += 1) {
    const x = a[c] ?? 0;
    out[c] = (x + ((b[c] ?? 0) - x) * k) * scale;
  }
}

export class DayNightCycle {
  readonly state: CycleState;
  private mode: TimeMode;
  private target: number | null = null;
  private readonly minSunY = Math.sin((DAY_CYCLE.minElevation * Math.PI) / 180);

  constructor(
    mode: TimeMode,
    private readonly reducedMotion: boolean,
    startTime: number = DAY_CYCLE.startTime,
  ) {
    this.mode = mode;
    this.state = {
      t: wrapTime(startTime),
      phase: "Day",
      sunDirection: new Float32Array([0, 1, 0]),
      sunColor: new Float32Array(3),
      sunIntensity: 1,
      hemiSky: new Float32Array(3),
      hemiGround: new Float32Array(3),
      hemiIntensity: 1,
      skyTop: new Float32Array(3),
      skyHorizon: new Float32Array(3),
      fogColor: new Float32Array(3),
      fogDensity: 0,
      exposure: 1,
      environment: 1,
      gradeA: 0,
      gradeB: 0,
      gradeMix: 0,
      bloom: 1,
      clouds: 0,
      shafts: 0,
      stars: 0,
      lightsOn: 0,
      daylight: 1,
    };
    if (mode !== "auto") {
      this.state.t = mode === "day" ? DAY_CYCLE.dayTime : DAY_CYCLE.nightTime;
    }
    this.evaluate();
  }

  get currentMode(): TimeMode {
    return this.mode;
  }

  /** Switches mode; fixed modes fast-forward the clock unless `instant` or reduced motion. */
  setMode(mode: TimeMode, instant = false): void {
    this.mode = mode;
    if (mode === "auto") {
      this.target = null;
      return;
    }
    const target = mode === "day" ? DAY_CYCLE.dayTime : DAY_CYCLE.nightTime;
    if (instant || this.reducedMotion) {
      this.state.t = target;
      this.target = null;
      this.evaluate();
    } else {
      this.target = target;
    }
  }

  update(deltaSeconds: number): void {
    if (this.target !== null) {
      const distance = wrapTime(this.target - this.state.t);
      const step = DAY_CYCLE.transitionSpeed * deltaSeconds;
      if (distance <= step || distance > 0.999) {
        this.state.t = this.target;
        this.target = null;
      } else {
        this.state.t = wrapTime(this.state.t + step);
      }
    } else if (this.mode === "auto") {
      this.state.t = wrapTime(this.state.t + deltaSeconds / DAY_CYCLE.lengthSeconds);
    }
    this.evaluate();
  }

  private evaluate(): void {
    const s = this.state;
    const t = s.t;
    const count = RESOLVED.length;
    let index = count - 1;
    for (let i = 0; i < count; i += 1) {
      const frame = RESOLVED[i];
      if (frame && frame.frame.t <= t) index = i;
    }
    const a = RESOLVED[index];
    const b = RESOLVED[(index + 1) % count];
    if (!a || !b) return;
    const start = a.frame.t;
    const end = b.frame.t <= start ? b.frame.t + 1 : b.frame.t;
    const span = end - start;
    const k = span > 0 ? smooth((t - start) / span) : 0;
    const mix = (x: number, y: number) => x + (y - x) * k;

    s.phase = a.frame.phase;
    mixInto(s.sunDirection, a.sun, b.sun, k);
    mixInto(s.sunColor, a.sunColor, b.sunColor, k);
    mixInto(s.hemiSky, a.hemiSky, b.hemiSky, k);
    mixInto(s.hemiGround, a.hemiGround, b.hemiGround, k);
    mixInto(s.skyTop, a.skyTop, b.skyTop, k);
    mixInto(s.skyHorizon, a.skyHorizon, b.skyHorizon, k);
    mixInto(s.fogColor, a.fog, b.fog, k);

    // Keep the key light above the minimum elevation so shadows always fall on the ground.
    const dir = s.sunDirection;
    let x = dir[0] ?? 0;
    let y = dir[1] ?? 1;
    let z = dir[2] ?? 0;
    const length = Math.hypot(x, y, z) || 1;
    x /= length;
    y /= length;
    z /= length;
    if (y < this.minSunY) {
      const horizontal = Math.hypot(x, z) || 1;
      const scale = Math.sqrt(1 - this.minSunY * this.minSunY) / horizontal;
      x *= scale;
      z *= scale;
      y = this.minSunY;
    }
    dir[0] = x;
    dir[1] = y;
    dir[2] = z;

    s.sunIntensity = mix(a.frame.sun.intensity, b.frame.sun.intensity);
    s.hemiIntensity = mix(a.frame.hemisphere.intensity, b.frame.hemisphere.intensity);
    s.fogDensity = mix(a.frame.fog.density, b.frame.fog.density);
    s.exposure = mix(a.frame.exposure, b.frame.exposure);
    s.environment = mix(a.frame.environment, b.frame.environment);
    s.bloom = mix(a.frame.bloom, b.frame.bloom);
    s.clouds = mix(a.frame.clouds, b.frame.clouds);
    s.shafts = mix(a.frame.shafts, b.frame.shafts);
    s.stars = mix(a.frame.stars, b.frame.stars);
    s.gradeA = a.grade;
    s.gradeB = b.grade;
    s.gradeMix = k;
    s.lightsOn = lightsOnAt(t);
    const up = t >= RISE && t <= SET;
    s.daylight = up ? Math.sin((Math.PI * (t - RISE)) / (SET - RISE)) : 0;
  }
}
