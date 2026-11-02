"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { MOVE } from "@/game3d/config/visuals";
import { useRuntime } from "@/game3d/runtime";

const RING = 16;

function pushBox(
  out: number[],
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
) {
  const c = [
    [minX, minY, minZ],
    [maxX, minY, minZ],
    [maxX, minY, maxZ],
    [minX, minY, maxZ],
    [minX, maxY, minZ],
    [maxX, maxY, minZ],
    [maxX, maxY, maxZ],
    [minX, maxY, maxZ],
  ] as const;
  const edges = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
  for (const index of edges) out.push(...(c[index] ?? c[0]));
}

function pushRing(out: number[], x: number, y: number, z: number, r: number) {
  for (let i = 0; i < RING; i += 1) {
    const a = (i / RING) * Math.PI * 2;
    const b = ((i + 1) / RING) * Math.PI * 2;
    out.push(
      x + Math.cos(a) * r,
      y,
      z + Math.sin(a) * r,
      x + Math.cos(b) * r,
      y,
      z + Math.sin(b) * r,
    );
  }
}

/**
 * The debug panel's collider view: the camera's colliders (building and stall boxes in orange,
 * tree and boulder spheres as rings), the player's movement circle, and the spring arm from
 * the head pivot to the camera, drawn on top of everything while "Show colliders" is ticked.
 */
export function ColliderDebug() {
  const runtime = useRuntime();
  const view = useMemo(() => {
    const material = new THREE.LineBasicMaterial({
      color: 0xf0a23b,
      depthTest: false,
      transparent: true,
      opacity: 0.85,
    });
    const armMaterial = new THREE.LineBasicMaterial({ color: 0x62b6ea, depthTest: false });
    const playerMaterial = new THREE.LineBasicMaterial({ color: 0xa4d65e, depthTest: false });
    const statics = new THREE.LineSegments(new THREE.BufferGeometry(), material);
    const arm = new THREE.Line(
      new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(6), 3),
      ),
      armMaterial,
    );
    const ring: number[] = [];
    pushRing(ring, 0, 0.05, 0, MOVE.radius);
    const player = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute(ring, 3),
      ),
      playerMaterial,
    );
    const group = new THREE.Group();
    group.add(statics, arm, player);
    group.renderOrder = 999;
    for (const child of group.children) {
      child.renderOrder = 999;
      child.frustumCulled = false;
    }
    group.visible = false;
    return { group, statics, arm, player, material, armMaterial, playerMaterial, shown: false };
  }, []);

  useEffect(
    () => () => {
      view.statics.geometry.dispose();
      view.arm.geometry.dispose();
      view.player.geometry.dispose();
      view.material.dispose();
      view.armMaterial.dispose();
      view.playerMaterial.dispose();
    },
    [view],
  );

  useFrame(() => {
    const show = runtime.tuning.showColliders;
    view.group.visible = show;
    if (!show) {
      view.shown = false;
      return;
    }
    if (!view.shown) {
      // Rebuilt each time it is switched on (the buildings register their boxes after loading).
      view.shown = true;
      const lines: number[] = [];
      const { boxes, spheres } = runtime.views.collision;
      for (const box of boxes)
        pushBox(lines, box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ);
      for (const sphere of spheres) {
        pushRing(lines, sphere.x, sphere.y, sphere.z, sphere.r);
        pushRing(lines, sphere.x, sphere.y + sphere.r * 0.7, sphere.z, sphere.r * 0.7);
      }
      view.statics.geometry.dispose();
      view.statics.geometry = new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute(lines, 3),
      );
    }
    const { third } = runtime.views;
    const arm = view.arm.geometry.getAttribute("position") as THREE.BufferAttribute;
    arm.setXYZ(0, third.pivot.x, third.pivot.y, third.pivot.z);
    arm.setXYZ(1, third.position.x, third.position.y, third.position.z);
    arm.needsUpdate = true;
    view.player.position.set(runtime.player.x, runtime.player.y, runtime.player.z);
  });

  return <primitive object={view.group} />;
}
