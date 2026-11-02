"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useStore } from "zustand";
import type { BuildingId } from "@/game/map/village";
import { PLAYER_SPRITES } from "@/game3d/config/assets";
import { CHARACTER, PLAYER_SIZE } from "@/game3d/config/character";
import { LIGHT_STYLES, QUALITY_TIERS, WEATHER, type LightKind } from "@/game3d/config/visuals";
import { linearRgb } from "@/game3d/lighting/DayNightCycle";
import { useRuntime } from "@/game3d/runtime";
import { Billboard } from "../billboard";
import { PlayerAnimator } from "./animation";
import { ANIMATIONS, DIRECTIONS } from "./art";
import { createGlowUniforms, patchPlayerGlow } from "./material";
import { PlayerSheet } from "./sheet";

const KIND_COLORS = Object.fromEntries(
  (Object.keys(LIGHT_STYLES) as LightKind[]).map((kind) => [
    kind,
    linearRgb(LIGHT_STYLES[kind].color),
  ]),
) as Record<LightKind, [number, number, number]>;

/** Light kinds that bounce warm light onto the hoodie. */
const BOUNCERS: ReadonlySet<LightKind> = new Set(["lamp", "lantern", "fire", "forge"]);

function cap(color: THREE.Color, max: number): void {
  const peak = Math.max(color.r, color.g, color.b);
  if (peak > max) color.multiplyScalar(max / peak);
}

/**
 * The player: a 16x16 billboard drawn from the atlas (generated, or the configured sprite
 * files), animated by a small state machine, with footsteps on footfalls, a wave on reaching
 * a doorway, a rim light from the sun or the nearest lamp and a warm lamp bounce underneath.
 */
export function Player() {
  const runtime = useRuntime();
  const level = useStore(runtime.store, (state) => state.level);
  const realShadows = QUALITY_TIERS[level].sunShadows;

  const actor = useMemo(() => {
    const sheet = new PlayerSheet();
    const glow = createGlowUniforms();
    const billboard = new Billboard(sheet.texture, runtime.uniforms, {
      width: PLAYER_SIZE.width,
      height: PLAYER_SIZE.height,
      extend: (material) => patchPlayerGlow(material, glow, PLAYER_SIZE.height),
    });
    return {
      sheet,
      glow,
      billboard,
      animator: new PlayerAnimator(),
      near: null as BuildingId | null,
      lamp: new THREE.Color(),
    };
  }, [runtime]);

  useEffect(() => {
    if (!PLAYER_SPRITES.image || !PLAYER_SPRITES.atlas) return;
    let cancelled = false;
    void actor.sheet.load(PLAYER_SPRITES.image, PLAYER_SPRITES.atlas).then((loaded) => {
      if (cancelled || !loaded) return;
      actor.billboard.setSheet(actor.sheet.texture);
      actor.glow.uRimTexel.value.set(1 / actor.sheet.width, 1 / actor.sheet.height);
    });
    return () => {
      cancelled = true;
    };
  }, [actor]);

  useEffect(
    () => () => {
      actor.billboard.dispose();
      actor.sheet.dispose();
    },
    [actor],
  );

  useEffect(() => actor.billboard.setShadowMode(realShadows), [actor, realShadows]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const { player, camera, cycle } = runtime;
    const { animator, billboard, sheet, glow } = actor;

    // Animation: wave once on reaching a doorway, footsteps on footfalls.
    const near = runtime.store.getState().near;
    if (near !== actor.near) {
      actor.near = near;
      if (near) animator.queueInteract();
      else animator.cancelInteract();
    }
    animator.update(delta, player.moving, player.running);
    if (animator.footfall) runtime.audio.play("step");
    const rect = sheet.rect(
      DIRECTIONS.indexOf(player.facing),
      ANIMATIONS.indexOf(animator.animation),
      animator.frame,
    );
    if (rect) billboard.setRect(rect, sheet.width, sheet.height);
    const sun = cycle.state.sunDirection;
    billboard.sunYaw = Math.atan2(sun[0] ?? 0, sun[2] ?? 1);
    billboard.place(player.x, player.y, player.z, camera.yaw);

    // Rim light: the key light by day, the nearest lamp when it is brighter.
    const state = cycle.state;
    const dim = 1 - (1 - WEATHER.rain.dim) * runtime.weather.rain;
    const sunStrength = state.sunIntensity * dim * CHARACTER.rim.strength * 0.5;
    let rimX = (sun[0] ?? 0) * camera.rightX + (sun[2] ?? 0) * camera.rightZ;
    let rimY = sun[1] ?? 1;
    const rim = glow.uRimColor.value;
    rim
      .setRGB(state.sunColor[0] ?? 1, state.sunColor[1] ?? 1, state.sunColor[2] ?? 1)
      .multiplyScalar(sunStrength);
    let best = 0;
    let bestIndex = -1;
    let bounce = 0;
    let bounceIndex = -1;
    const sources = runtime.lightSources;
    for (let i = 0; i < sources.length; i += 1) {
      const source = sources[i];
      if (!source) continue;
      const style = LIGHT_STYLES[source.kind];
      const on = style.nightOnly ? state.lightsOn : 0.35 + 0.65 * state.lightsOn;
      const distance = Math.hypot(source.x - player.x, source.z - player.z);
      const falloff = Math.max(0, 1 - distance / CHARACTER.bounce.radius);
      const strength = style.intensity * on * falloff * falloff;
      if (strength > best) {
        best = strength;
        bestIndex = i;
      }
      if (BOUNCERS.has(source.kind) && strength > bounce) {
        bounce = strength;
        bounceIndex = i;
      }
    }
    const lamp = sources[bestIndex];
    if (CHARACTER.rim.enabled && lamp) {
      const [r, g, b] = KIND_COLORS[lamp.kind];
      const lampStrength = best * CHARACTER.rim.strength * 0.12;
      actor.lamp.setRGB(r, g, b).multiplyScalar(lampStrength);
      rim.add(actor.lamp);
      if (lampStrength > sunStrength) {
        const dx = lamp.x - player.x;
        const dz = lamp.z - player.z;
        rimX = dx * camera.rightX + dz * camera.rightZ;
        rimY = lamp.y - (player.y + PLAYER_SIZE.height * 0.6);
      }
    }
    if (!CHARACTER.rim.enabled) rim.setRGB(0, 0, 0);
    cap(rim, CHARACTER.rim.max);
    const length = Math.hypot(rimX, rimY) || 1;
    glow.uRimDirection.value.set(rimX / length, rimY / length);

    const bouncer = sources[bounceIndex];
    const bounceColor = glow.uBounceColor.value;
    if (CHARACTER.bounce.enabled && bouncer) {
      const [r, g, b] = KIND_COLORS[bouncer.kind];
      bounceColor.setRGB(r, g, b).multiplyScalar(bounce * CHARACTER.bounce.strength * 0.2);
      cap(bounceColor, CHARACTER.bounce.max);
    } else {
      bounceColor.setRGB(0, 0, 0);
    }
  });

  return (
    <>
      <primitive object={actor.billboard.mesh} />
      <primitive object={actor.billboard.blob} />
    </>
  );
}
