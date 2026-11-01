"use client";

import { useProgress } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useStore } from "zustand";
import { SPRITE_SHEET_PATH, SURFACE_NORMAL_MAPS } from "@/game3d/config/assets";
import type { SurfaceName } from "@/game3d/textures/surfaces";
import { Buildings } from "@/game3d/entities/Buildings";
import { Characters } from "@/game3d/entities/Characters";
import { Props } from "@/game3d/entities/Props";
import { Lighting } from "@/game3d/lighting/Lights";
import { Effects } from "@/game3d/post/Effects";
import { useRuntime } from "@/game3d/runtime";
import { QualityMonitor } from "@/game3d/settings/QualityMonitor";
import { Simulation } from "@/game3d/systems/Simulation";
import { Weather } from "@/game3d/weather/Weather";
import { mapInfoFor } from "@/game3d/world/layout";
import { AssetsContext, createAssets, disposeAssets, useAssets } from "./assets";
import { Sky } from "./Sky";
import { Terrain } from "./Terrain";
import { Water } from "./Water";

/**
 * Loads the optional surface normal maps after the first interactive frame (they only add
 * relief, so they never delay the first picture). Missing files keep the flat surface.
 */
function NormalMaps() {
  const runtime = useRuntime();
  const assets = useAssets();
  const interactive = useStore(runtime.store, (state) => state.interactive);
  useEffect(() => {
    if (!interactive) return;
    let cancelled = false;
    const loaded: THREE.Texture[] = [];
    const loader = new THREE.TextureLoader();
    for (const name of Object.keys(SURFACE_NORMAL_MAPS) as SurfaceName[]) {
      const path = SURFACE_NORMAL_MAPS[name];
      if (!path) continue;
      loader
        .loadAsync(path)
        .then((texture) => {
          if (cancelled) {
            texture.dispose();
            return;
          }
          // Same tiling as the colour texture: 16 texels per world unit.
          const image = texture.image as { width: number; height: number };
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          texture.generateMipmaps = false;
          texture.repeat.set(16 / image.width, 16 / image.height);
          loaded.push(texture);
          assets.materials.applyNormalMap(name, texture);
        })
        .catch((error: unknown) =>
          console.warn(`Normal map "${path}" could not be loaded; ${name} stays flat.`, error),
        );
    }
    return () => {
      cancelled = true;
      loaded.forEach((texture) => texture.dispose());
    };
  }, [interactive, assets]);
  return null;
}

/**
 * Reports loading progress (generated assets, optional sprite sheet through the loading
 * manager, shader compilation) and announces the world as ready after its first frame.
 */
function Readiness() {
  const runtime = useRuntime();
  const assets = useAssets();
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const { active, progress } = useProgress();
  const [sheetDone, setSheetDone] = useState(SPRITE_SHEET_PATH === null);
  const [compiled, setCompiled] = useState(false);
  const flags = useMemo(() => ({ frames: 0, announced: false }), []);

  useEffect(() => {
    if (!SPRITE_SHEET_PATH) return;
    let cancelled = false;
    new THREE.TextureLoader()
      .loadAsync(SPRITE_SHEET_PATH)
      .then((texture) => {
        if (cancelled) return;
        assets.sheet.image = texture.image;
        assets.sheet.needsUpdate = true;
        texture.dispose();
      })
      .catch((error: unknown) =>
        console.warn(`Sprite sheet "${SPRITE_SHEET_PATH}" failed; using the generated one.`, error),
      )
      .finally(() => {
        if (!cancelled) setSheetDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [assets]);

  useEffect(() => {
    let cancelled = false;
    runtime.bridge.emit("progress", { value: 0.7, label: "Lighting the lamps" });
    gl.compileAsync(scene, camera)
      .catch((error: unknown) =>
        console.warn("Shader warm-up failed; compiling on first use.", error),
      )
      .finally(() => {
        if (!cancelled) setCompiled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera, runtime]);

  useEffect(() => {
    if (active) {
      runtime.bridge.emit("progress", {
        value: 0.7 + 0.2 * (progress / 100),
        label: "Unpacking the art",
      });
    }
  }, [active, progress, runtime]);

  useFrame(() => {
    if (flags.announced || !compiled || !sheetDone) return;
    flags.frames += 1;
    // Announce after a couple of rendered frames, so the loader fades onto a finished picture.
    if (flags.frames < 3) return;
    flags.announced = true;
    runtime.bridge.emit("progress", { value: 1, label: "Welcome!" });
    runtime.bridge.emit("ready", mapInfoFor(runtime.layout));
    runtime.store.getState().setInteractive();
  });

  return null;
}

/** Everything inside the canvas: assets, the scene, systems and post-processing. */
export function World() {
  const runtime = useRuntime();
  const [assets] = useState(() => createAssets(runtime.uniforms));
  useEffect(() => () => disposeAssets(assets), [assets]);
  useEffect(() => {
    runtime.bridge.emit("progress", { value: 0.5, label: "Raising the village" });
  }, [runtime]);

  return (
    <AssetsContext.Provider value={assets}>
      <Simulation />
      <Sky />
      <Lighting />
      <Terrain />
      <Water />
      <Buildings />
      <Props />
      <Characters />
      <Weather />
      <Effects />
      <QualityMonitor />
      <NormalMaps />
      <Readiness />
    </AssetsContext.Provider>
  );
}
