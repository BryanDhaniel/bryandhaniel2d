import { createContext, useContext } from "react";
import type { SectionId } from "@/content/portfolio";
import type { EventPort, Events } from "@/game/bridge";
import type { CameraOptions, CameraTuning } from "@/game/settings/types";
import { THIRD_PERSON } from "@/game3d/config/camera";
import { CAMERA, QUALITY_TIERS, SUN } from "@/game3d/config/visuals";
import type { BuildingModel, LightSource } from "@/game3d/entities/buildingModels";
import { DayNightCycle } from "@/game3d/lighting/DayNightCycle";
import type { QualityManager } from "@/game3d/settings/QualityManager";
import { createWorldUniforms, type WorldUniforms } from "@/game3d/shaders/patch";
import type { VillageStore } from "@/game3d/store";
import type { AudioSystem } from "@/game3d/systems/audio";
import { CameraCollision } from "@/game3d/systems/camera/CameraCollision";
import { CameraModeManager } from "@/game3d/systems/camera/CameraModeManager";
import { IsometricRig } from "@/game3d/systems/camera/IsometricRig";
import { ThirdPersonRig } from "@/game3d/systems/camera/ThirdPersonRig";
import { InputController } from "@/game3d/systems/input";
import { PathFollower } from "@/game3d/systems/pathing";
import { GridPathfinder } from "@/game3d/systems/pathfinding";
import { buildLayout, groundHeight, terrainHeight, type WorldLayout } from "@/game3d/world/layout";

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
    /** The way the player faces: the ground direction (sin heading, cos heading). */
    heading: number;
    moving: boolean;
    running: boolean;
    /** Vertical speed (jumps and falls) and whether the feet are off the ground. */
    vy: number;
    airborne: boolean;
    /** Index of the building the player is walking to (tap or travel), or -1. */
    pendingBuilding: number;
  };
  /**
   * The view this frame, whichever camera is in use. The camera director writes it after the
   * rigs run; billboards, lights, weather and movement read it.
   */
  camera: {
    /** View yaw in radians: the camera sits at focus + (sin yaw, ·, cos yaw) · distance. */
    yaw: number;
    /** What the camera looks at: the player's surroundings (isometric) or head (third-person). */
    focusX: number;
    focusY: number;
    focusZ: number;
    /** Ground-plane basis of the view: screen right and "into the screen". */
    rightX: number;
    rightZ: number;
    forwardX: number;
    forwardZ: number;
    /** Camera position. */
    x: number;
    y: number;
    z: number;
    /** 0 = isometric, 1 = third-person (eased during the switch). */
    blend: number;
    /** True while the perspective camera renders (third-person or blending). */
    perspective: boolean;
  };
  /** The two views, the switch between them and the third-person arm's collision. */
  views: {
    iso: IsometricRig;
    third: ThirdPersonRig;
    modes: CameraModeManager;
    collision: CameraCollision;
  };
  /** Live tunables (the debug panel edits them). */
  tuning: CameraTuning;
  cameraOptions: CameraOptions;
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
  /** One per building the visitor can open: the waypoint anchor and the doorway. */
  landmarks: Landmark[];
  /** Index (into layout.buildings) of the doorway the player can use right now, or -1. */
  nearIndex: number;
  /** A quick-travel request (a building index), handled on the next frame; -1 when none. */
  teleport: number;
  /** Footfalls so far and where the last one landed (dust and splashes follow them). */
  footsteps: { count: number; x: number; z: number };
}

export interface Landmark {
  buildingIndex: number;
  sectionId: SectionId;
  label: string;
  /** Marker position above the roof. */
  x: number;
  y: number;
  z: number;
  doorX: number;
  doorZ: number;
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
  const tuning: CameraTuning = {
    fov: THIRD_PERSON.fov,
    armLength: THIRD_PERSON.armLength,
    shoulderOffset: THIRD_PERSON.shoulderOffset,
    positionDamping: THIRD_PERSON.damping.position,
    rotationDamping: THIRD_PERSON.damping.yaw,
    shadowBias: SUN.bias,
    shadowNormalBias: SUN.normalBias,
    showColliders: false,
  };
  const spawnY = groundHeight(layout, spawn.x, spawn.z);
  const iso = new IsometricRig();
  iso.focus.x = spawn.x;
  iso.focus.y = spawnY + CAMERA.focusHeight;
  iso.focus.z = spawn.z;
  const third = new ThirdPersonRig(tuning);
  const input = new InputController();
  input.setMode(state.cameraMode);
  input.setOptions(state.cameraOptions);
  // Start facing into the village (map north), with the camera behind.
  third.placeBehind(Math.PI, true);
  return {
    ...options,
    layout,
    cycle: new DayNightCycle(state.timeMode, options.reducedMotion),
    uniforms: createWorldUniforms(),
    input,
    finder,
    path: new PathFollower(finder, layout.width * layout.height),
    player: {
      x: spawn.x,
      y: spawnY,
      z: spawn.z,
      heading: Math.PI,
      moving: false,
      running: false,
      vy: 0,
      airborne: false,
      pendingBuilding: -1,
    },
    camera: {
      yaw,
      focusX: spawn.x,
      focusY: spawnY + CAMERA.focusHeight,
      focusZ: spawn.z,
      rightX: Math.cos(yaw),
      rightZ: -Math.sin(yaw),
      forwardX: -Math.sin(yaw),
      forwardZ: -Math.cos(yaw),
      x: spawn.x,
      y: CAMERA.distance,
      z: spawn.z,
      blend: state.cameraMode === "thirdPerson" ? 1 : 0,
      perspective: state.cameraMode === "thirdPerson",
    },
    views: {
      iso,
      third,
      modes: new CameraModeManager(state.cameraMode),
      collision: new CameraCollision(layout, (x, z) => terrainHeight(layout, x, z)),
    },
    tuning,
    cameraOptions: state.cameraOptions,
    weather: { rain: 0, wetness: 0 },
    flicker: 0,
    elapsed: 0,
    buildings: [],
    lightSources: [],
    landmarks: [],
    nearIndex: -1,
    teleport: -1,
    footsteps: { count: 0, x: spawn.x, z: spawn.z },
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

/**
 * Yaw that turns a billboard at (x, z) toward the camera: parallel to the view plane for the
 * orthographic view, toward the camera's position in perspective (so nearby sprites don't skew).
 */
export function billboardYaw(runtime: WorldRuntime, x: number, z: number): number {
  const { camera } = runtime;
  if (!camera.perspective) return camera.yaw;
  return Math.atan2(camera.x - x, camera.z - z);
}

/** The tier features for a quality level (convenience for components). */
export function tierOf(runtime: WorldRuntime) {
  return QUALITY_TIERS[runtime.store.getState().level];
}
