import { createStore } from "zustand/vanilla";
import type { BuildingId } from "@/game/map/village";
import type { QualityLevel, QualitySetting, TimeMode, WeatherKind } from "@/game/settings/types";

/**
 * Discrete game state that components react to (settings, the quality tier, the camera turn,
 * which doorway the player is in). Values that change every frame (positions, the clock) live
 * in the mutable `WorldRuntime` instead, so they never trigger React renders.
 * One store per mounted game, so strict-mode remounts never share state.
 */
export interface VillageState {
  timeMode: TimeMode;
  weather: WeatherKind;
  quality: QualitySetting;
  level: QualityLevel;
  pixelMode: boolean;
  grain: boolean;
  aberration: boolean;
  paused: boolean;
  /** Quarter turns of the camera around the village (Q / R). */
  cameraTurn: number;
  /** Doorway the player is standing in, if any. */
  near: BuildingId | null;
  /** DPR factor from the performance monitor (Auto quality), 0.5 to 1. */
  dprFactor: number;
  /** True once the first frame has rendered and lazy assets may load. */
  interactive: boolean;
  contextLost: boolean;
  setTimeMode: (mode: TimeMode) => void;
  setWeather: (kind: WeatherKind) => void;
  setQuality: (setting: QualitySetting, level: QualityLevel) => void;
  setLevel: (level: QualityLevel) => void;
  setVisualOptions: (options: { pixelMode: boolean; grain: boolean; aberration: boolean }) => void;
  setPaused: (paused: boolean) => void;
  turnCamera: (direction: 1 | -1) => void;
  setNear: (near: BuildingId | null) => void;
  setDprFactor: (factor: number) => void;
  setInteractive: () => void;
  setContextLost: (lost: boolean) => void;
}

export interface VillageStoreInit {
  timeMode: TimeMode;
  weather: WeatherKind;
  quality: QualitySetting;
  level: QualityLevel;
  pixelMode: boolean;
  grain: boolean;
  aberration: boolean;
}

export function createVillageStore(init: VillageStoreInit) {
  return createStore<VillageState>()((set) => ({
    ...init,
    paused: false,
    cameraTurn: 0,
    near: null,
    dprFactor: 1,
    interactive: false,
    contextLost: false,
    setTimeMode: (timeMode) => set({ timeMode }),
    setWeather: (weather) => set({ weather }),
    setQuality: (quality, level) => set({ quality, level }),
    setLevel: (level) => set({ level }),
    setVisualOptions: (options) => set(options),
    setPaused: (paused) => set({ paused }),
    turnCamera: (direction) => set((state) => ({ cameraTurn: state.cameraTurn + direction })),
    setNear: (near) => set({ near }),
    setDprFactor: (dprFactor) => set({ dprFactor }),
    setInteractive: () => set({ interactive: true }),
    setContextLost: (contextLost) => set({ contextLost }),
  }));
}

export type VillageStore = ReturnType<typeof createVillageStore>;
