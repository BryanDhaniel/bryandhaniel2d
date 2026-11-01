import type { SectionId } from "@/content/portfolio";
import type {
  DayPhase,
  QualityLevel,
  QualitySetting,
  TimeMode,
  WeatherKind,
} from "./settings/types";

/**
 * A tiny typed event channel between React (overlays, HUD) and the 3D world.
 * One instance per mounted game, so React strict-mode remounts never share listeners.
 * Handlers take a single payload argument to avoid per-call array allocation.
 */
export class Channel<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as (payload: never) => void);
    return () => {
      set.delete(handler as (payload: never) => void);
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event);
    if (!set) {
      return;
    }
    for (const handler of set) {
      (handler as (value: Events[K]) => void)(payload);
    }
  }

  clear(): void {
    this.handlers.clear();
  }

  /**
   * A view of this channel whose subscriptions can all be dropped at once, and which stops
   * emitting after `dispose()`, so a world that is being torn down can't talk to the UI.
   */
  scope(): ScopedChannel<Events> {
    const subscriptions = new Set<() => void>();
    let active = true;
    return {
      on: (event, handler) => {
        if (!active) {
          return () => {};
        }
        const off = this.on(event, handler);
        subscriptions.add(off);
        return () => {
          off();
          subscriptions.delete(off);
        };
      },
      emit: (event, payload) => {
        if (active) {
          this.emit(event, payload);
        }
      },
      dispose: () => {
        active = false;
        subscriptions.forEach((off) => off());
        subscriptions.clear();
      },
    };
  }
}

export interface EventPort<Events extends object> {
  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): () => void;
  emit<K extends keyof Events>(event: K, payload: Events[K]): void;
}

export interface ScopedChannel<Events extends object> extends EventPort<Events> {
  dispose(): void;
}

export interface MapMarker {
  buildingId: string;
  sectionId: SectionId;
  label: string;
  tileX: number;
  tileY: number;
}

/** Terrain classes for the HUD mini-map, one byte per tile. */
export const MINIMAP_TERRAIN = {
  grass: 0,
  path: 1,
  water: 2,
  forest: 3,
  blocked: 4,
  building: 5,
} as const;

export interface MapInfo {
  width: number;
  height: number;
  terrain: Uint8Array;
  markers: MapMarker[];
}

export interface PlayerPosition {
  /** Position in tiles (fractional). The same object is reused between events. */
  x: number;
  y: number;
}

export interface ScreenPoint {
  /** CSS pixels inside the game container. The same object is reused between events. */
  x: number;
  y: number;
}

export interface GameToUiEvents {
  progress: { value: number; label: string };
  ready: MapInfo;
  near: { sectionId: SectionId | null; label: string | null };
  open: { sectionId: SectionId };
  location: { name: string };
  moved: null;
  position: PlayerPosition;
  /** The "E / Tap" bubble: shown above the building the player is standing at. */
  prompt: { visible: boolean };
  promptPosition: ScreenPoint;
  clock: { phase: DayPhase };
  qualityLevel: { level: QualityLevel; setting: QualitySetting };
  lowFps: null;
  fatal: { reason: "webgl" | "assets" | "runtime"; message: string };
}

export interface UiToGameEvents {
  pause: { paused: boolean };
  setTimeMode: { mode: TimeMode };
  setWeather: { kind: WeatherKind };
  setQuality: { setting: QualitySetting };
  setVisualOptions: { pixelMode: boolean; grain: boolean; aberration: boolean };
  /** Quarter-turn the camera: -1 counter-clockwise (Q), 1 clockwise (R). */
  rotateCamera: { direction: 1 | -1 };
  /** D-pad direction in screen terms (y down), each -1, 0 or 1. */
  dpad: { x: number; y: number };
  interact: null;
  travel: { sectionId: SectionId };
  resetInput: null;
}

export type Events = GameToUiEvents & UiToGameEvents;

export class GameBridge extends Channel<Events> {}
