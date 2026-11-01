import type * as Phaser from "phaser";
import type { EventPort, Events } from "./bridge";
import type { QualitySetting, TimeMode, WeatherKind } from "./settings/types";
import type { AudioSystem } from "./systems/audio";
import type { ViewportLayout } from "./systems/viewport";

export interface GameOptions {
  reducedMotion: boolean;
  /** Coarse pointer: the HUD shows "Tap" prompts and the D-pad. */
  touch: boolean;
  timeMode: TimeMode;
  weather: WeatherKind;
  quality: QualitySetting;
  /** CRT / film-grain filter. */
  retro: boolean;
}

/** The DOM side of the pixel-perfect viewport, owned by createGame. */
export interface ViewportService {
  /** Current layout; updated in place before each Phaser resize event. */
  readonly layout: ViewportLayout;
  /** Shifts the upscaled canvas by whole device pixels (sub-texel camera motion). */
  setOffset(deviceX: number, deviceY: number): void;
  /** Client (viewport CSS) position of the latest pointer press over the game. */
  readonly pointer: { x: number; y: number };
  /** Converts a client position to canvas texels, using the canvas's current on-screen box. */
  clientToCanvas(clientX: number, clientY: number, out: { x: number; y: number }): void;
}

/** Everything the scenes need from the outside world, passed through the game registry. */
export interface Services {
  bridge: EventPort<Events>;
  audio: AudioSystem;
  options: GameOptions;
  viewport: ViewportService;
}

export const SERVICES_KEY = "services";

export function getServices(scene: Phaser.Scene): Services {
  const services = scene.registry.get(SERVICES_KEY) as Services | undefined;
  if (!services) {
    throw new Error("Game services were not registered before the scene started.");
  }
  return services;
}
