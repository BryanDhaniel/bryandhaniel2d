import { QUALITY, QUALITY_TIERS, type TierFeatures } from "@/game3d/config/visuals";
import type { QualityLevel, QualitySetting } from "@/game/settings/types";

const ORDER: readonly QualityLevel[] = ["low", "medium", "high"];

/**
 * Resolves the quality setting (Low / Medium / High / Auto) to a tier. In Auto the drei
 * PerformanceMonitor calls `incline()` / `decline()` as the measured frame time moves out of
 * its bounds; fixed settings ignore those calls. It also watches for a frame rate that stays
 * under 30 FPS on Low, which is when the plain view is offered.
 */
export class QualityManager {
  private current: QualityLevel;
  private choice: QualitySetting;
  private windowTime = 0;
  private windowFrames = 0;
  private slowSeconds = 0;
  private reported = false;

  constructor(
    setting: QualitySetting,
    private readonly onChange: (level: QualityLevel, setting: QualitySetting) => void,
  ) {
    this.choice = setting;
    this.current = setting === "auto" ? QUALITY.autoStart : setting;
  }

  get level(): QualityLevel {
    return this.current;
  }

  get setting(): QualitySetting {
    return this.choice;
  }

  get features(): TierFeatures {
    return QUALITY_TIERS[this.current];
  }

  get auto(): boolean {
    return this.choice === "auto";
  }

  setSetting(setting: QualitySetting): void {
    this.choice = setting;
    this.current = setting === "auto" ? QUALITY.autoStart : setting;
    this.resetWatch();
    this.onChange(this.current, this.choice);
  }

  /** Auto only: one tier up (the frame rate has headroom). */
  incline(): void {
    this.step(1);
  }

  /** Auto only: one tier down (frames are too slow). */
  decline(): void {
    this.step(-1);
  }

  /**
   * Feed every frame's duration. Returns true exactly once, when the game has stayed under
   * the plain-view threshold on Low for long enough. Long stalls (a hidden tab, a dialog)
   * restart the measurement instead of counting as slowness.
   */
  sampleFrame(deltaSeconds: number): boolean {
    if (this.reported) {
      return false;
    }
    if (deltaSeconds > 0.25 || deltaSeconds <= 0) {
      this.resetWatch();
      return false;
    }
    this.windowTime += deltaSeconds;
    this.windowFrames += 1;
    if (this.windowTime < 1) {
      return false;
    }
    const fps = this.windowFrames / this.windowTime;
    this.windowTime = 0;
    this.windowFrames = 0;
    if (this.current !== "low" || fps >= QUALITY.plainOfferFps) {
      this.slowSeconds = 0;
      return false;
    }
    this.slowSeconds += 1;
    if (this.slowSeconds >= QUALITY.lowFpsSeconds) {
      this.reported = true;
      return true;
    }
    return false;
  }

  private step(direction: 1 | -1): void {
    if (this.choice !== "auto") {
      return;
    }
    const next = ORDER[ORDER.indexOf(this.current) + direction];
    if (!next || next === this.current) {
      return;
    }
    this.current = next;
    this.resetWatch();
    this.onChange(this.current, this.choice);
  }

  private resetWatch(): void {
    this.windowTime = 0;
    this.windowFrames = 0;
    this.slowSeconds = 0;
  }
}
