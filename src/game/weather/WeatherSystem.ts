import type * as Phaser from "phaser";
import { WEATHER } from "@/game/config/visuals";
import type { CycleState } from "@/game/lighting/DayNightCycle";
import type { WeatherKind } from "@/game/settings/types";
import { Fireflies } from "./Fireflies";
import { Fog } from "./Fog";
import { Rain } from "./Rain";

/**
 * The weather layer: optional rain with splashes and puddles, drifting fog (thicker at dawn,
 * at night and in the rain) and fireflies after dark. Disabled entirely below High quality.
 */
export class WeatherSystem {
  private readonly rain: Rain;
  private readonly fog: Fog;
  private readonly fireflies: Fireflies;
  private kind: WeatherKind;
  private enabled = false;

  constructor(
    scene: Phaser.Scene,
    kind: WeatherKind,
    fireflySpots: readonly { x: number; y: number }[],
    private readonly reducedMotion: boolean,
  ) {
    this.kind = kind;
    this.rain = new Rain(scene);
    this.fog = new Fog(scene);
    this.fireflies = new Fireflies(scene, fireflySpots);
  }

  /** 0-1 rain intensity (after fading). */
  get rainLevel(): number {
    return this.rain.level;
  }

  /** 0-1 puddle wetness; lags behind the rain. */
  get wetness(): number {
    return this.rain.wetness;
  }

  /** Multiplier for the ambient light (overcast while raining). */
  get ambientScale(): number {
    return 1 - (1 - WEATHER.rain.dim) * this.rain.level;
  }

  setKind(kind: WeatherKind): void {
    this.kind = kind;
    this.applyRain();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.applyRain();
  }

  update(
    time: number,
    deltaMs: number,
    cycle: CycleState,
    view: Phaser.Geom.Rectangle,
    canvasWidth: number,
    canvasHeight: number,
    scrollX: number,
    scrollY: number,
  ): void {
    this.rain.update(deltaMs, view);
    const fogAmount = this.enabled ? Math.max(cycle.fog, this.rain.level * WEATHER.fog.rain) : 0;
    this.fog.update(deltaMs, fogAmount, scrollX, scrollY, canvasWidth, canvasHeight);
    this.fireflies.update(time, this.enabled ? cycle.lightsOn : 0);
  }

  destroy(): void {
    this.rain.destroy();
    this.fog.destroy();
    this.fireflies.destroy();
  }

  private applyRain(): void {
    this.rain.setActive(this.enabled && this.kind === "rain" && !this.reducedMotion);
  }
}
