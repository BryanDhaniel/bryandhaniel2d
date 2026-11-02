"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useState, type RefObject } from "react";
import * as THREE from "three";
import { useStore } from "zustand";
import type { GameBridge } from "@/game/bridge";
import type {
  CameraMode,
  CameraOptions,
  QualitySetting,
  TimeMode,
  WeatherKind,
} from "@/game/settings/types";
import { CAMERA, QUALITY_TIERS } from "@/game3d/config/visuals";
import { createRuntime, RuntimeContext } from "@/game3d/runtime";
import { World } from "@/game3d/scene/World";
import { installHeightFog } from "@/game3d/shaders/fog";
import { QualityManager } from "@/game3d/settings/QualityManager";
import { createVillageStore } from "@/game3d/store";
import type { AudioSystem } from "@/game3d/systems/audio";

export interface VillageOptions {
  reducedMotion: boolean;
  touch: boolean;
  timeMode: TimeMode;
  weather: WeatherKind;
  quality: QualitySetting;
  pixelMode: boolean;
  grain: boolean;
  aberration: boolean;
  cameraMode: CameraMode;
  camera: CameraOptions;
}

interface VillageWorldProps {
  bridge: GameBridge;
  audio: AudioSystem;
  /** The focusable element that receives keyboard input. */
  keyboardTarget: RefObject<HTMLDivElement | null>;
  options: VillageOptions;
}

const CONTEXT_RESTORE_MS = 4000;

/**
 * The 3D village: one React Three Fiber canvas per mount with its own store, runtime and
 * quality manager. UI events arrive over the bridge; game events go back the same way.
 * Loaded with next/dynamic (ssr: false) from GameCanvas, so three.js never reaches the
 * server render or the /plain route.
 */
export default function VillageWorld({
  bridge,
  audio,
  keyboardTarget,
  options,
}: VillageWorldProps) {
  const [setup] = useState(() => {
    installHeightFog();
    const level = options.quality === "auto" ? "medium" : options.quality;
    const store = createVillageStore({
      timeMode: options.timeMode,
      weather: options.weather,
      quality: options.quality,
      level,
      pixelMode: options.pixelMode,
      grain: options.grain,
      aberration: options.aberration,
      cameraMode: options.cameraMode,
      cameraOptions: options.camera,
    });
    const quality = new QualityManager(options.quality, (next, setting) => {
      store.getState().setQuality(setting, next);
      bridge.emit("qualityLevel", { level: next, setting });
    });
    store.getState().setLevel(quality.level);
    const runtime = createRuntime({
      store,
      bridge,
      audio,
      quality,
      reducedMotion: options.reducedMotion,
      touch: options.touch,
    });
    return { store, quality, runtime };
  });
  const { store, quality, runtime } = setup;
  const level = useStore(store, (state) => state.level);
  const dprFactor = useStore(store, (state) => state.dprFactor);
  const paused = useStore(store, (state) => state.paused);
  const contextLost = useStore(store, (state) => state.contextLost);

  // UI → game.
  useEffect(() => {
    const state = () => store.getState();
    const subscriptions = [
      bridge.on("pause", ({ paused: next }) => {
        state().setPaused(next);
        // A panel takes over: let go of keys, drags and the captured mouse.
        if (next) runtime.input.reset();
      }),
      bridge.on("setCameraMode", ({ mode }) => state().setCameraMode(mode)),
      bridge.on("setCameraOptions", (next) => {
        state().setCameraOptions(next);
        runtime.cameraOptions = next;
        runtime.input.setOptions(next);
      }),
      bridge.on("resetCamera", () => runtime.input.queueResetCamera()),
      bridge.on("move", ({ x, y }) => runtime.input.setJoystick(x, y)),
      bridge.on("run", ({ on }) => runtime.input.setRunToggle(on)),
      bridge.on("teleport", ({ sectionId }) => {
        runtime.teleport = runtime.layout.buildings.findIndex(
          (building) => building.sectionId === sectionId && building.id !== "mailbox",
        );
      }),
      bridge.on("tune", (next) => Object.assign(runtime.tuning, next)),
      bridge.on("requestTuning", () => bridge.emit("tuning", { ...runtime.tuning })),
      bridge.on("setTimeMode", ({ mode }) => {
        state().setTimeMode(mode);
        runtime.cycle.setMode(mode);
      }),
      bridge.on("setWeather", ({ kind }) => state().setWeather(kind)),
      bridge.on("setQuality", ({ setting }) => quality.setSetting(setting)),
      bridge.on("setVisualOptions", (next) => state().setVisualOptions(next)),
      bridge.on("rotateCamera", ({ direction }) => runtime.input.queueTurn(direction)),
      bridge.on("dpad", ({ x, y }) => runtime.input.setDpad(x, y)),
      bridge.on("interact", () => runtime.input.queueInteract()),
      bridge.on("travel", ({ sectionId }) => {
        const index = runtime.layout.buildings.findIndex(
          (building) => building.sectionId === sectionId && building.id !== "mailbox",
        );
        const building = runtime.layout.buildings[index];
        if (building) {
          runtime.input.queueTap({
            tileX: building.approachX,
            tileZ: building.approachZ,
            buildingIndex: index,
          });
        }
      }),
      bridge.on("resetInput", () => runtime.input.reset()),
    ];
    bridge.emit("qualityLevel", { level: quality.level, setting: quality.setting });
    return () => subscriptions.forEach((off) => off());
  }, [bridge, store, runtime, quality]);

  useEffect(() => {
    const target = keyboardTarget.current;
    if (!target) return;
    runtime.input.attach(target);
    return () => runtime.input.detach();
  }, [keyboardTarget, runtime]);

  const tier = QUALITY_TIERS[level];
  const deviceRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const dpr = Math.max(
    0.75,
    Math.min(deviceRatio, tier.maxDpr) * (quality.auto ? 0.75 + 0.25 * dprFactor : 1),
  );
  const yaw = (CAMERA.yaw * Math.PI) / 180;
  const pitch = (CAMERA.pitch * Math.PI) / 180;
  const start = runtime.camera;

  return (
    <Canvas
      orthographic
      shadows="percentage"
      dpr={dpr}
      frameloop={paused || contextLost ? "demand" : "always"}
      camera={{
        position: [
          start.focusX + Math.sin(yaw) * Math.cos(pitch) * CAMERA.distance,
          start.focusY + Math.sin(pitch) * CAMERA.distance,
          start.focusZ + Math.cos(yaw) * Math.cos(pitch) * CAMERA.distance,
        ],
        zoom: 60,
        near: CAMERA.near,
        far: CAMERA.far,
      }}
      gl={{ antialias: true, powerPreference: "high-performance", stencil: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        let timer: number | undefined;
        gl.domElement.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          store.getState().setContextLost(true);
          timer = window.setTimeout(() => {
            bridge.emit("fatal", {
              reason: "webgl",
              message: "The graphics context was lost and did not come back.",
            });
          }, CONTEXT_RESTORE_MS);
        });
        gl.domElement.addEventListener("webglcontextrestored", () => {
          window.clearTimeout(timer);
          store.getState().setContextLost(false);
        });
      }}
      style={{ position: "absolute", inset: 0 }}
    >
      <RuntimeContext.Provider value={runtime}>
        <World />
      </RuntimeContext.Provider>
    </Canvas>
  );
}
