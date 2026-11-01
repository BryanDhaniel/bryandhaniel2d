import {
  DAY_CYCLE,
  SUN,
  TIME_KEYFRAMES,
  type DayPhase,
  type TimeKeyframe,
} from "@/game/config/visuals";
import { PALETTE, type PaletteName } from "@/game/palette";

import type { TimeMode } from "@/game/settings/types";

/** Everything the renderer needs about the time of day. Mutated in place every frame. */
export interface CycleState {
  /** Time of day in [0, 1): 0 midnight, 0.5 noon. */
  t: number;
  phase: DayPhase;
  readonly ambient: Float32Array;
  readonly gradeTint: Float32Array;
  gradeStrength: number;
  saturation: number;
  contrast: number;
  brightness: number;
  bloom: number;
  vignette: number;
  fog: number;
  /** 0 by day, 1 at night; fades at dusk and dawn. Drives lamps and lit windows. */
  lightsOn: number;
  /** -1 at sunrise (east), 0 at noon, +1 at sunset (west). */
  sunDirection: number;
  /** Which pre-baked shadow frame matches the sun right now. */
  shadowStep: number;
  shadowAlpha: number;
  /** 0 at night, 1 with the sun high. */
  daylight: number;
}

function rgb(name: PaletteName, scale = 1): [number, number, number] {
  const value = Number.parseInt(PALETTE[name].slice(1), 16);
  return [
    (((value >> 16) & 255) / 255) * scale,
    (((value >> 8) & 255) / 255) * scale,
    ((value & 255) / 255) * scale,
  ];
}

interface ResolvedKeyframe {
  frame: TimeKeyframe;
  ambient: [number, number, number];
  grade: [number, number, number];
}

const RESOLVED: readonly ResolvedKeyframe[] = TIME_KEYFRAMES.map((frame) => ({
  frame,
  ambient: rgb(frame.ambient, frame.ambientIntensity),
  grade: rgb(frame.gradeTint),
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

/** Shadow geometry for a baked sun step: horizontal shear and length (fraction of height). */
export function sunPose(
  step: number,
  steps: number = SUN.steps,
): { shear: number; length: number } {
  const direction = steps > 1 ? (step / (steps - 1)) * 2 - 1 : 0;
  const lean = Math.abs(direction) ** 1.5;
  return {
    shear: direction * SUN.maxShear,
    length: SUN.minLength + (SUN.maxLength - SUN.minLength) * lean,
  };
}

export class DayNightCycle {
  readonly state: CycleState;
  private mode: TimeMode;
  private target: number | null = null;

  constructor(
    mode: TimeMode,
    private readonly reducedMotion: boolean,
    startTime: number = DAY_CYCLE.startTime,
  ) {
    this.mode = mode;
    this.state = {
      t: wrapTime(startTime),
      phase: "Day",
      ambient: new Float32Array(3),
      gradeTint: new Float32Array(3),
      gradeStrength: 0,
      saturation: 1,
      contrast: 1,
      brightness: 1,
      bloom: 1,
      vignette: 1,
      fog: 0,
      lightsOn: 0,
      sunDirection: 0,
      shadowStep: 0,
      shadowAlpha: 0,
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

  update(deltaMs: number): void {
    const seconds = deltaMs / 1000;
    if (this.target !== null) {
      const distance = wrapTime(this.target - this.state.t);
      const step = DAY_CYCLE.transitionSpeed * seconds;
      if (distance <= step || distance > 0.999) {
        this.state.t = this.target;
        this.target = null;
      } else {
        this.state.t = wrapTime(this.state.t + step);
      }
    } else if (this.mode === "auto") {
      this.state.t = wrapTime(this.state.t + seconds / DAY_CYCLE.lengthSeconds);
    }
    this.evaluate();
  }

  /** Recomputes the state for the current time (no allocations). */
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
    for (let c = 0; c < 3; c += 1) {
      s.ambient[c] = mix(a.ambient[c] ?? 1, b.ambient[c] ?? 1);
      s.gradeTint[c] = mix(a.grade[c] ?? 1, b.grade[c] ?? 1);
    }
    s.gradeStrength = mix(a.frame.gradeStrength, b.frame.gradeStrength);
    s.saturation = mix(a.frame.saturation, b.frame.saturation);
    s.contrast = mix(a.frame.contrast, b.frame.contrast);
    s.brightness = mix(a.frame.brightness, b.frame.brightness);
    s.bloom = mix(a.frame.bloom, b.frame.bloom);
    s.vignette = mix(a.frame.vignette, b.frame.vignette);
    s.fog = mix(a.frame.fog, b.frame.fog);
    s.lightsOn = lightsOnAt(t);

    const up = t >= SUN.rise && t <= SUN.set;
    const progress = (t - SUN.rise) / (SUN.set - SUN.rise);
    s.sunDirection = up ? progress * 2 - 1 : 0;
    s.shadowStep = Math.round(((s.sunDirection + 1) / 2) * (SUN.steps - 1));
    const fadeIn = Math.min(1, Math.max(0, (t - SUN.rise) / SUN.fade));
    const fadeOut = Math.min(1, Math.max(0, (SUN.set - t) / SUN.fade));
    s.shadowAlpha = up ? SUN.maxAlpha * fadeIn * fadeOut : 0;
    s.daylight = up ? Math.sin(Math.PI * Math.min(1, Math.max(0, progress))) : 0;
  }
}
