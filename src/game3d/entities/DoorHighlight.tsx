"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { PALETTE } from "@/game/palette";
import { useRuntime } from "@/game3d/runtime";

/** Thickness of the glowing frame's bars, and how far it stands off the wall. */
const BAR = 0.07;
const STAND_OFF = 0.06;

/**
 * Outlines the door the player can use right now: a glowing gold frame around it (bright
 * enough to bloom), pulsing gently unless reduced motion is on. One frame is moved and scaled
 * to whichever door is active, so it costs three boxes whatever the village holds.
 */
export function DoorHighlight() {
  const runtime = useRuntime();
  const frame = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(PALETTE.gold).multiplyScalar(2.2),
      toneMapped: false,
      transparent: true,
      depthWrite: false,
    });
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const group = new THREE.Group();
    const left = new THREE.Mesh(geometry, material);
    const right = new THREE.Mesh(geometry, material);
    const top = new THREE.Mesh(geometry, material);
    group.add(left, right, top);
    group.visible = false;
    return { group, left, right, top, geometry, material, index: -1 };
  }, []);

  useEffect(
    () => () => {
      frame.geometry.dispose();
      frame.material.dispose();
    },
    [frame],
  );

  useFrame(() => {
    const index = runtime.nearIndex;
    const model = runtime.buildings[index];
    const paused = runtime.store.getState().paused;
    frame.group.visible = Boolean(model) && !paused;
    if (!model) {
      frame.index = -1;
      return;
    }
    if (frame.index !== index) {
      frame.index = index;
      const { x, y, z, width, height } = model.door;
      frame.group.position.set(x, y, z + STAND_OFF);
      frame.left.scale.set(BAR, height + BAR, BAR);
      frame.left.position.set(-(width / 2 + BAR / 2), (height + BAR) / 2, 0);
      frame.right.scale.copy(frame.left.scale);
      frame.right.position.set(width / 2 + BAR / 2, (height + BAR) / 2, 0);
      frame.top.scale.set(width + BAR * 2, BAR, BAR);
      frame.top.position.set(0, height + BAR / 2, 0);
    }
    frame.material.opacity = runtime.reducedMotion
      ? 0.9
      : 0.65 + 0.3 * Math.sin(runtime.elapsed * 4.2);
  });

  return <primitive object={frame.group} />;
}
