"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useStore } from "zustand";
import { MODEL_PATHS } from "@/game3d/config/assets";
import { CUTAWAY, QUALITY_TIERS, WAYPOINTS } from "@/game3d/config/visuals";
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
  // A hand-made model has no procedural stand-ins: it stays at full detail.
  model.root.userData.custom = true;
}

/** Seconds between building level-of-detail checks. */
const LOD_EVERY = 0.25;

interface BuildingLod {
  /** Walls and roof only (no interior, trim, signs or props). */
  mid: THREE.Group;
  /** A single block and roof in the building's own materials. */
  far: THREE.Group;
  level: number;
}

/**
 * The two cheaper levels of a building: the middle one reuses its wall and roof meshes (same
 * geometry and materials, so cutaway fades still apply), the far one is a box and a pyramid
 * over the footprint in the wall and roof materials.
 */
function buildLod(model: BuildingModel): BuildingLod {
  const mid = new THREE.Group();
  mid.position.copy(model.root.position);
  for (const part of model.fadeParts) {
    const copy = part.mesh.clone();
    copy.castShadow = false;
    mid.add(copy);
  }
  const far = new THREE.Group();
  far.position.copy(model.root.position);
  const bounds = new THREE.Box3();
  for (const part of model.fadeParts) {
    if (part.group !== "roof") bounds.expandByObject(part.mesh);
  }
  const wall = model.fadeParts.find((part) => part.group !== "roof")?.material;
  const roof = model.fadeParts.find((part) => part.group === "roof")?.material ?? wall;
  if (wall && !bounds.isEmpty()) {
    const size = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3()).sub(model.root.position);
    const block = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), wall);
    block.position.copy(centre);
    far.add(block);
    if (roof) {
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(Math.hypot(size.x, size.z) / 2, size.y * 0.5, 4),
        roof,
      );
      cap.rotation.y = Math.PI / 4;
      cap.position.set(centre.x, centre.y + size.y / 2 + size.y * 0.25, centre.z);
      far.add(cap);
    }
  }
  mid.visible = false;
  far.visible = false;
  return { mid, far, level: 0 };
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
    // Camera colliders (footprint up to the roof) and the third-person waypoints.
    const bounds = new THREE.Box3();
    const boxes = models.map((model, index) => {
      const { rect } = runtime.layout.buildings[index] ?? {
        rect: { x: 0, y: 0, width: 0, height: 0 },
      };
      bounds.setFromObject(model.root);
      return {
        minX: rect.x - 0.2,
        minY: 0,
        minZ: rect.y - 0.2,
        maxX: rect.x + rect.width + 0.2,
        maxY: bounds.max.y,
        maxZ: rect.y + rect.height + 0.2,
      };
    });
    runtime.views.collision.setBuildings(boxes);
    runtime.landmarks = runtime.layout.buildings.flatMap((building, index) => {
      const box = boxes[index];
      if (building.id === "mailbox" || !box) return [];
      return [
        {
          buildingIndex: index,
          sectionId: building.sectionId,
          label: building.label,
          x: building.centerX,
          y: box.maxY + WAYPOINTS.lift,
          z: building.centerZ,
          doorX: building.doorX,
          doorZ: building.doorZ,
        },
      ];
    });
    return () => {
      runtime.buildings = [];
      runtime.lightSources = [];
      runtime.landmarks = [];
      runtime.views.collision.setBuildings([]);
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

  const lods = useMemo(() => models.map(buildLod), [models]);
  useEffect(
    () => () => {
      for (const lod of lods) {
        for (const child of lod.far.children) {
          if (child instanceof THREE.Mesh) child.geometry.dispose();
        }
      }
    },
    [lods],
  );
  const lodClock = useMemo(() => ({ elapsed: LOD_EVERY }), []);

  useFrame((_, delta) => {
    // Levels of detail: full detail near the third-person camera (and always in isometric).
    lodClock.elapsed += delta;
    if (lodClock.elapsed >= LOD_EVERY) {
      lodClock.elapsed = 0;
      const { camera } = runtime;
      const reach = QUALITY_TIERS[runtime.store.getState().level].drawDistance;
      for (let i = 0; i < models.length; i += 1) {
        const model = models[i];
        const lod = lods[i];
        const layout = runtime.layout.buildings[i];
        if (!model || !lod || !layout) continue;
        let level = 0;
        if (camera.perspective && model.root.userData.custom !== true) {
          const d = Math.hypot(layout.centerX - camera.x, layout.centerZ - camera.z);
          level = d < reach * 0.55 ? 0 : d < reach * 1.1 ? 1 : 2;
        }
        if (level !== lod.level) {
          lod.level = level;
          model.root.visible = level === 0;
          lod.mid.visible = level === 1;
          lod.far.visible = level === 2;
        }
      }
    }
    // No cutaway in third-person: the camera is down at street level, outside.
    const near = runtime.camera.blend < 0.5 ? runtime.store.getState().near : null;
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
      {lods.map((lod, index) => (
        <group key={index}>
          <primitive object={lod.mid} />
          <primitive object={lod.far} />
        </group>
      ))}
      {models.map((model, index) => (
        <primitive key={model.id} object={model.root} onClick={onTap(index)} />
      ))}
    </group>
  );
}
