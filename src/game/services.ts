import type * as Phaser from "phaser";
import type { EventPort, Events } from "./bridge";
import type { AudioSystem } from "./systems/audio";

export interface GameOptions {
  reducedMotion: boolean;
  /** Coarse pointer: show "Tap" prompts instead of "E". */
  touch: boolean;
  night: boolean;
  /** CSS font-family of the UI pixel font, so canvas text matches the HTML. */
  fontFamily: string;
}

/** Everything the scenes need from the outside world, passed through the game registry. */
export interface Services {
  bridge: EventPort<Events>;
  audio: AudioSystem;
  options: GameOptions;
}

export const SERVICES_KEY = "services";

export function getServices(scene: Phaser.Scene): Services {
  const services = scene.registry.get(SERVICES_KEY) as Services | undefined;
  if (!services) {
    throw new Error("Game services were not registered before the scene started.");
  }
  return services;
}
