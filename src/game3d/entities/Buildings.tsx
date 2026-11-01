"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useStore } from "zustand";
import { MODEL_PATHS } from "@/game3d/config/assets";
import { CUTAWAY } from "@/game3d/config/visuals";
import { useRuntime } from "@/game3d/runtime";
import { useAssets } from "@/game3d/scene/assets";
import { groundHeight } from "@/game3d/world/layout";
import {
  buildBuilding,
  disposeBuilding,
  type BuildingModel,
  type FadePart,
} from "./buildingModels";
import { LAMP_HEAD } from "./Props";

const SIDE_NORMALS: Record<string, readonly [number, number]> = {
  "wall-s": [0, 1],
  "wall-n": [0, -1],
  "wall-e": [1, 0],
  "wall-w": [-1, 0],
};

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) value.dispose();
        }
        material.dispose();
      }
    }
  });
}

/**
 * Places a glTF model on a building's footprint: scaled to fit, centred and stood on the
 * ground. Meshes named "roof…" or "front…" join the cutaway.
 */
function adoptModel(model: BuildingModel, scene: THREE.Object3D): void {
  const bounds = new THREE.Box3().setFromObject(scene);
  const size = bounds.getSize(new THREE.Vector3());
  const runtimeFootprint = model.root.userData.footprint as { width: number; depth: number };
  const scale = Math.min(
    runtimeFootprint.width / Math.max(size.x, 1e-3),
    runtimeFootprint.depth / Math.max(size.z, 1e-3),
  );
  scene.scale.setScalar(scale);
  const centre = bounds.getCenter(new THREE.Vector3());
  scene.position.set(
    runtimeFootprint.width / 2 - centre.x * scale,
    -bounds.min.y * scale,
    runtimeFootprint.depth / 2 - centre.z * scale,
  );
  for (const child of model.root.children) child.visible = false;
  model.fadeParts.length = 0;
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const name = child.name.toLowerCase();
    const group = name.includes("roof") ? "roof" : name.includes("front") ? "wall-s" : null;
    if (group && child.material instanceof THREE.MeshStandardMaterial) {
      const material = child.material.clone();
      child.material = material;
      model.fadeParts.push({ mesh: child, group, material });
    }
  });
  model.root.add(scene);
}

function setOpacity(part: FadePart, opacity: number): void {
  const { material } = part;
  material.opacity = opacity;
  const transparent = opacity < 0.999;
  if (material.transparent !== transparent) {
    material.transparent = transparent;
    material.needsUpdate = true;
  }
  // A faded roof lets the light in, so the interior isn't left in its shadow.
  if (part.group === "roof") part.mesh.castShadow = opacity > 0.6;
}

/** The six portfolio buildings: procedural by default, glTF when a model path is set. */
export function Buildings() {
  const runtime = useRuntime();
  const assets = useAssets();
  const interactive = useStore(runtime.store, (state) => state.interactive);

  const models = useMemo(
    () =>
      runtime.layout.buildings.map((layout) => {
        const model = buildBuilding(layout, assets.materials, assets.signs);
        model.root.userData.footprint = { width: layout.rect.width, depth: layout.rect.height };
        return model;
      }),
    [runtime.layout, assets],
  );

  useEffect(() => {
    runtime.buildings = models;
    // Street lamps plus every building's windows, lanterns, hearths, forge and monitors.
    runtime.lightSources = [
      ...runtime.layout.lamps.map((lamp, index) => ({
        kind: "lamp" as const,
        x: lamp.x,
        y: groundHeight(runtime.layout, lamp.x, lamp.z) + LAMP_HEAD - 0.1,
        z: lamp.z,
        seed: index * 2.3,
      })),
      ...models.flatMap((model) => model.lights),
    ];
    return () => {
      runtime.buildings = [];
      runtime.lightSources = [];
      models.forEach(disposeBuilding);
    };
  }, [runtime, models]);

  // Real models load after the first interactive frame; a missing file keeps the fallback.
  useEffect(() => {
    if (!interactive) return;
    let cancelled = false;
    const loaded: THREE.Object3D[] = [];
    const loader = new GLTFLoader();
    models.forEach((model) => {
      const path = MODEL_PATHS[model.id];
      if (!path) return;
      loader
        .loadAsync(path)
        .then((gltf) => {
          if (cancelled) {
            disposeObject(gltf.scene);
            return;
          }
          adoptModel(model, gltf.scene);
          loaded.push(gltf.scene);
        })
        .catch((error: unknown) => {
          console.warn(
            `Model "${path}" could not be loaded; keeping the built-in ${model.id}.`,
            error,
          );
        });
    });
    return () => {
      cancelled = true;
      loaded.forEach(disposeObject);
    };
  }, [interactive, models]);

  useFrame((_, delta) => {
    const near = runtime.store.getState().near;
    const toCameraX = -runtime.camera.forwardX;
    const toCameraZ = -runtime.camera.forwardZ;
    const step = 1 - Math.exp(-CUTAWAY.rate * Math.min(delta, 0.1));
    const time = runtime.elapsed;
    const wind = runtime.reducedMotion ? 0 : 1;
    for (const model of runtime.buildings) {
      const open = near === model.id;
      for (const part of model.fadeParts) {
        let target = 1;
        if (open) {
          // The roof and the door's (front) wall always fade; so do walls facing the camera,
          // so the player at the door stays visible whichever way the view is turned.
          const normal = SIDE_NORMALS[part.group];
          const facesCamera = normal ? normal[0] * toCameraX + normal[1] * toCameraZ > 0.25 : true;
          if (part.group === "roof" || part.group === "wall-s" || facesCamera)
            target = CUTAWAY.opacity;
        }
        const current = part.material.opacity;
        if (Math.abs(current - target) > 0.001) {
          setOpacity(
            part,
            Math.abs(current - target) < 0.004 ? target : current + (target - current) * step,
          );
        }
      }
      for (const spinner of model.spinners) {
        spinner.object.rotation[spinner.axis] += spinner.speed * delta * wind;
      }
      for (const swinger of model.swingers) {
        swinger.object.rotation.x = Math.sin(time * 1.6 + swinger.phase) * swinger.amplitude * wind;
      }
    }
  });

  const onTap = (index: number) => (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 8) return;
    event.stopPropagation();
    const layout = runtime.layout.buildings[index];
    if (layout) {
      runtime.input.queueTap({
        tileX: layout.approachX,
        tileZ: layout.approachZ,
        buildingIndex: index,
      });
    }
  };

  return (
    <group>
      {models.map((model, index) => (
        <primitive key={model.id} object={model.root} onClick={onTap(index)} />
      ))}
    </group>
  );
}
