import { QUALITY } from "@/game/config/visuals";

import type { QualityLevel, QualitySetting } from "./types";

export interface QualityFeatures {
  /** Normal-mapped Light2D lighting (otherwise ambient-only, unlit). */
  lighting: boolean;
  /** Bloom, colour grading and vignette. */
  postFx: boolean;
  /** "blob" = only character blobs; "full" adds sun shadows, occlusion and lamp contact shadows. */
  shadows: "blob" | "full";
  /** Water ripples and sparkles (post pass). */
  water: boolean;
  reflections: boolean;
  /** Rain, fog and fireflies. */
  weather: boolean;
}

export const QUALITY_FEATURES: Record<QualityLevel, QualityFeatures> = {
  low: {
    lighting: false,
    postFx: false,
    shadows: "blob",
    water: false,
    reflections: false,
    weather: false,
  },
  medium: {
    lighting: true,
    postFx: true,
    shadows: "full",
    water: true,
    reflections: false,
    weather: false,
  },
  high: {
    lighting: true,
    postFx: true,
    shadows: "full",
    water: true,
    reflections: true,
    weather: true,
  },
};

const ORDER: readonly QualityLevel[] = ["low", "medium", "high"];

/**
 * Resolves the quality setting to a level. In "auto" it starts at High, measures the frame
 * rate in windows after a warm-up, and steps down while the average stays below the target.
 * It never steps back up, so the picture doesn't flicker between levels.
 */
export class QualityManager {
  private setting: QualitySetting;
  private current: QualityLevel;
  private measuring = false;
  private warmup = 0;
  private windowTime = 0;
  private windowFrames = 0;
  private goodWindows = 0;

  constructor(
    setting: QualitySetting,
    private readonly onChange: (level: QualityLevel, setting: QualitySetting) => void,
  ) {
    this.setting = setting;
    this.current = setting === "auto" ? "high" : setting;
    this.restartMeasurement();
  }

  get level(): QualityLevel {
    return this.current;
  }

  get features(): QualityFeatures {
    return QUALITY_FEATURES[this.current];
  }

  get currentSetting(): QualitySetting {
    return this.setting;
  }

  setSetting(setting: QualitySetting): void {
    this.setting = setting;
    const level = setting === "auto" ? "high" : setting;
    this.restartMeasurement();
    if (level !== this.current) {
      this.current = level;
    }
    this.onChange(this.current, this.setting);
  }

  /** Feed every frame's delta while the page is visible. */
  sample(deltaMs: number): void {
    if (!this.measuring) {
      return;
    }
    // A frame this long means the page was hidden or stalled (tab switch, a dialog), not a
    // slow GPU: a struggling device shows consistently long frames instead. Start over.
    if (deltaMs > QUALITY.auto.stallMs) {
      this.windowTime = 0;
      this.windowFrames = 0;
      return;
    }
    if (this.warmup < QUALITY.auto.warmupMs) {
      this.warmup += deltaMs;
      return;
    }
    this.windowTime += deltaMs;
    this.windowFrames += 1;
    if (this.windowTime < QUALITY.auto.windowMs) {
      return;
    }
    const fps = (this.windowFrames * 1000) / this.windowTime;
    this.windowTime = 0;
    this.windowFrames = 0;
    if (fps < QUALITY.auto.minFps && this.current !== "low") {
      this.current = ORDER[ORDER.indexOf(this.current) - 1] ?? "low";
      this.goodWindows = 0;
      // Give the lighter level a moment to settle before judging it.
      this.warmup = QUALITY.auto.warmupMs / 2;
      this.onChange(this.current, this.setting);
      return;
    }
    this.goodWindows += 1;
    if (this.goodWindows >= QUALITY.auto.stableWindows || this.current === "low") {
      this.measuring = false;
    }
  }

  private restartMeasurement(): void {
    this.measuring = this.setting === "auto";
    this.warmup = 0;
    this.windowTime = 0;
    this.windowFrames = 0;
    this.goodWindows = 0;
  }
}
