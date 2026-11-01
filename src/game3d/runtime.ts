import { createContext, useContext } from "react";
import type { Facing } from "@/game/art/characters";
import type { EventPort, Events } from "@/game/bridge";
import { CAMERA, QUALITY_TIERS } from "@/game3d/config/visuals";
import type { BuildingModel, LightSource } from "@/game3d/entities/buildingModels";
import { DayNightCycle } from "@/game3d/lighting/DayNightCycle";
import type { QualityManager } from "@/game3d/settings/QualityManager";
import { createWorldUniforms, type WorldUniforms } from "@/game3d/shaders/patch";
import type { VillageStore } from "@/game3d/store";
import type { AudioSystem } from "@/game3d/systems/audio";
import { InputController } from "@/game3d/systems/input";
import { PathFollower } from "@/game3d/systems/pathing";
import { GridPathfinder } from "@/game3d/systems/pathfinding";
import { buildLayout, groundHeight, type WorldLayout } from "@/game3d/world/layout";

/**
 * Mutable per-frame state of one mounted world, shared through React context. Systems write
 * it in their frame callbacks and visual components read it, so nothing here causes renders
 * and nothing is allocated per frame.
 */
export interface WorldRuntime {
  layout: WorldLayout;
  store: VillageStore;
  bridge: EventPort<Events>;
  audio: AudioSystem;
  quality: QualityManager;
  reducedMotion: boolean;
  touch: boolean;
  cycle: DayNightCycle;
  uniforms: WorldUniforms;
  input: InputController;
  finder: GridPathfinder;
  path: PathFollower;
  player: {
    x: number;
    y: number;
    z: number;
    facing: Facing;
    moving: boolean;
    running: boolean;
    /** Index of the building the player is walking to (tap or travel), or -1. */
    pendingBuilding: number;
  };
  camera: {
    /** Current yaw in radians (eases toward the turn target). */
    yaw: number;
    focusX: number;
    focusY: number;
    focusZ: number;
    /** User zoom multiplier (current and target). */
    zoom: number;
    zoomTarget: number;
    /** Ground-plane basis of the view: screen right and screen up. */
    rightX: number;
    rightZ: number;
    forwardX: number;
    forwardZ: number;
  };
  weather: {
    /** Eased 0-1 rain level and the slower surface wetness. */
    rain: number;
    wetness: number;
  };
  /** Light flicker phase, shared by lamps and glowing materials. */
  flicker: number;
  elapsed: number;
  buildings: BuildingModel[];
  lightSources: LightSource[];
}

export interface RuntimeOptions {
  store: VillageStore;
  bridge: EventPort<Events>;
  audio: AudioSystem;
  quality: QualityManager;
  reducedMotion: boolean;
  touch: boolean;
}

export function createRuntime(options: RuntimeOptions): WorldRuntime {
  const layout = buildLayout();
  const spawn = layout.spawns.find((entry) => entry.kind === "player") ?? { x: 20, z: 15 };
  const state = options.store.getState();
  const finder = new GridPathfinder(layout.width, layout.height, layout.walkable);
  const yaw = (CAMERA.yaw * Math.PI) / 180;
  return {
    ...options,
    layout,
    cycle: new DayNightCycle(state.timeMode, options.reducedMotion),
    uniforms: createWorldUniforms(),
    input: new InputController(),
    finder,
    path: new PathFollower(finder, layout.width * layout.height),
    player: {
      x: spawn.x,
      y: groundHeight(layout, spawn.x, spawn.z),
      z: spawn.z,
      facing: "down",
      moving: false,
      running: false,
      pendingBuilding: -1,
    },
    camera: {
      yaw,
      focusX: spawn.x,
      focusY: CAMERA.focusHeight,
      focusZ: spawn.z,
      zoom: 1,
      zoomTarget: 1,
      rightX: Math.cos(yaw),
      rightZ: -Math.sin(yaw),
      forwardX: -Math.sin(yaw),
      forwardZ: -Math.cos(yaw),
    },
    weather: { rain: 0, wetness: 0 },
    flicker: 0,
    elapsed: 0,
    buildings: [],
    lightSources: [],
  };
}

export const RuntimeContext = createContext<WorldRuntime | null>(null);

export function useRuntime(): WorldRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) {
    throw new Error("useRuntime must be used inside the village world.");
  }
  return runtime;
}

/** The tier features for a quality level (convenience for components). */
export function tierOf(runtime: WorldRuntime) {
  return QUALITY_TIERS[runtime.store.getState().level];
}
