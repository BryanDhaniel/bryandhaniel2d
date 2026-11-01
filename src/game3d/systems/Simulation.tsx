"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ScreenPoint } from "@/game/bridge";
import { areaNameAt } from "@/game/map/village";
import { CAMERA, CLOUDS, MOVE, QUALITY_TIERS, WEATHER, WIND } from "@/game3d/config/visuals";
import { facingFor } from "@/game3d/entities/Characters";
import { useRuntime } from "@/game3d/runtime";
import { useAssets } from "@/game3d/scene/assets";
import { groundHeight, inZone } from "@/game3d/world/layout";

const LOCATION_EVERY = 0.25;
const POSITION_EVERY = 0.1;
const QUARTER = Math.PI / 2;
const BASE_YAW = (CAMERA.yaw * Math.PI) / 180;
const PITCH = (CAMERA.pitch * Math.PI) / 180;

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * The game loop: input, movement and collision, doorways and panels, the clock, weather and
 * shared shader inputs (priority -2), then the camera rig and the HTML prompt position
 * (priority -1). Everything runs before rendering and allocates nothing per frame.
 */
export function Simulation() {
  const runtime = useRuntime();
  const assets = useAssets();
  const gl = useThree((state) => state.gl);

  const scratch = useMemo(
    () => ({
      steer: { x: 0, z: 0 },
      locationTimer: 0,
      positionTimer: 0,
      location: "",
      phase: "",
      moved: false,
      nearIndex: -1,
      position: { x: 0, y: 0 },
      prompt: { x: Number.NaN, y: Number.NaN } as ScreenPoint,
      anchor: new THREE.Vector3(),
      turn: { from: BASE_YAW, to: BASE_YAW, t: 1 },
      lastTurn: 0,
      zoomApplied: 0,
      stepFrame: -1,
    }),
    [],
  );

  // Mouse wheel and pinch zoom on the canvas.
  useEffect(() => {
    const element = gl.domElement;
    const clamp = (value: number) => Math.min(CAMERA.maxZoom, Math.max(CAMERA.minZoom, value));
    const onWheel = (event: WheelEvent) => {
      runtime.camera.zoomTarget = clamp(
        runtime.camera.zoomTarget * Math.exp(-event.deltaY * CAMERA.wheelStep),
      );
    };
    const touches = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const spread = () => {
      const points = [...touches.values()];
      const a = points[0];
      const b = points[1];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size === 2) pinch = spread();
    };
    const onMove = (event: PointerEvent) => {
      const touch = touches.get(event.pointerId);
      if (!touch) return;
      touch.x = event.clientX;
      touch.y = event.clientY;
      if (touches.size === 2 && pinch > 0) {
        const next = spread();
        runtime.camera.zoomTarget = clamp(runtime.camera.zoomTarget * (next / pinch));
        pinch = next;
      }
    };
    const onUp = (event: PointerEvent) => {
      touches.delete(event.pointerId);
      pinch = touches.size === 2 ? spread() : 0;
    };
    element.addEventListener("wheel", onWheel, { passive: true });
    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerup", onUp);
    element.addEventListener("pointercancel", onUp);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerup", onUp);
      element.removeEventListener("pointercancel", onUp);
    };
  }, [gl, runtime]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const { store, input, player, layout, bridge, camera } = runtime;
    const state = store.getState();
    const tier = QUALITY_TIERS[state.level];
    runtime.elapsed += delta;

    // Quality watch (raw frame time) and the low-FPS offer of the plain view.
    if (document.visibilityState === "visible" && runtime.quality.sampleFrame(rawDelta)) {
      bridge.emit("lowFps", null);
    }
    if (state.paused) return;

    input.update();
    const turn = input.consumeTurn();
    if (turn !== 0) state.turnCamera(turn > 0 ? 1 : -1);
    const zoomSteps = input.consumeZoom();
    if (zoomSteps !== 0) {
      camera.zoomTarget = Math.min(
        CAMERA.maxZoom,
        Math.max(CAMERA.minZoom, camera.zoomTarget * (1 + zoomSteps * CAMERA.keyStep)),
      );
    }

    // Tap or travel: plan a route to a tile (and remember the building to open on arrival).
    const tap = input.consumeTap();
    if (tap) {
      let goal = runtime.finder.isWalkable(tap.tileX, tap.tileZ)
        ? tap.tileZ * layout.width + tap.tileX
        : runtime.finder.nearestWalkable(tap.tileX, tap.tileZ, 3);
      if (goal >= 0) {
        const gx = goal % layout.width;
        const gz = Math.floor(goal / layout.width);
        if (!runtime.path.plan(Math.floor(player.x), Math.floor(player.z), gx, gz)) goal = -1;
      }
      player.pendingBuilding = goal >= 0 ? tap.buildingIndex : -1;
    }

    // Movement: keys and D-pad are screen-relative; otherwise follow the planned path.
    let dirX = 0;
    let dirZ = 0;
    let run = input.run;
    const { intent } = input;
    if (intent.x !== 0 || intent.y !== 0) {
      runtime.path.cancel();
      player.pendingBuilding = -1;
      dirX = camera.rightX * intent.x + camera.forwardX * intent.y;
      dirZ = camera.rightZ * intent.x + camera.forwardZ * intent.y;
    } else if (runtime.path.active && runtime.path.steer(player.x, player.z, scratch.steer)) {
      dirX = scratch.steer.x;
      dirZ = scratch.steer.z;
      run = true;
    }
    const length = Math.hypot(dirX, dirZ);
    player.moving = length > 0.01;
    player.running = run && player.moving;
    if (player.moving) {
      const speed = MOVE.walkSpeed * (run ? MOVE.runMultiplier * 0.8 : 1) * Math.min(1, length);
      layout.collision.move(
        player,
        (dirX / length) * speed * delta,
        (dirZ / length) * speed * delta,
        MOVE.radius,
      );
      player.facing = facingFor(runtime, dirX, dirZ);
      if (!scratch.moved) {
        scratch.moved = true;
        bridge.emit("moved", null);
      }
      // Footsteps on alternate walk frames.
      const frame = Math.floor(runtime.elapsed * 8 * (run ? 1.5 : 1)) % 4;
      if (frame !== scratch.stepFrame && frame % 2 === 1) runtime.audio.play("step");
      scratch.stepFrame = frame;
    }
    const ground = groundHeight(layout, player.x, player.z);
    player.y += (ground - player.y) * (1 - Math.exp(-MOVE.heightRate * delta));

    // Doorways: the prompt, the cutaway and opening panels.
    let nearIndex = -1;
    for (let index = 0; index < layout.buildings.length && nearIndex < 0; index += 1) {
      const building = layout.buildings[index];
      if (building && inZone(building.zone, player.x, player.z)) nearIndex = index;
    }
    if (nearIndex !== scratch.nearIndex) {
      scratch.nearIndex = nearIndex;
      const building = layout.buildings[nearIndex];
      state.setNear(building ? building.id : null);
      bridge.emit("prompt", { visible: Boolean(building) });
      bridge.emit(
        "near",
        building
          ? { sectionId: building.sectionId, label: building.label }
          : { sectionId: null, label: null },
      );
      scratch.prompt.x = Number.NaN;
    }
    const nearBuilding = layout.buildings[nearIndex];
    const arrived = runtime.path.arrived;
    if (input.consumeInteract() && nearBuilding) {
      runtime.path.cancel();
      bridge.emit("open", { sectionId: nearBuilding.sectionId });
    } else if (arrived && player.pendingBuilding >= 0) {
      const target = layout.buildings[player.pendingBuilding];
      player.pendingBuilding = -1;
      if (target && target === nearBuilding) bridge.emit("open", { sectionId: target.sectionId });
    }

    // The clock, weather and the shader inputs everything shares.
    runtime.cycle.update(delta);
    const cycle = runtime.cycle.state;
    const raining = state.weather === "rain" && tier.weather !== "off" && !runtime.reducedMotion;
    const weather = runtime.weather;
    weather.rain += ((raining ? 1 : 0) - weather.rain) * (1 - Math.exp(-delta / 1.2));
    const wetRate = raining ? WEATHER.rain.wetRate : -WEATHER.rain.dryRate;
    weather.wetness = Math.min(1, Math.max(0, weather.wetness + wetRate * delta));
    runtime.flicker = runtime.reducedMotion
      ? 0
      : Math.sin(runtime.elapsed * 17) * 0.5 + Math.sin(runtime.elapsed * 5.3) * 0.5;
    assets.materials.setNight(cycle.lightsOn, runtime.flicker);
    const uniforms = runtime.uniforms;
    uniforms.uTime.value = runtime.elapsed;
    uniforms.uCloudOffset.value.x += (CLOUDS.speed[0] * delta) / CLOUDS.scale;
    uniforms.uCloudOffset.value.y += (CLOUDS.speed[1] * delta) / CLOUDS.scale;
    uniforms.uCloudStrength.value = tier.clouds
      ? cycle.clouds * CLOUDS.strength * (1 - 0.6 * weather.rain)
      : 0;
    uniforms.uWind.value.x = runtime.reducedMotion ? 0 : WIND.amplitude * (1 + weather.rain * 0.8);
    uniforms.uWetness.value = weather.wetness;

    // HUD feeds.
    if (cycle.phase !== scratch.phase) {
      scratch.phase = cycle.phase;
      bridge.emit("clock", { phase: cycle.phase });
    }
    scratch.locationTimer += delta;
    if (scratch.locationTimer >= LOCATION_EVERY) {
      scratch.locationTimer = 0;
      const name = areaNameAt(Math.floor(player.x), Math.floor(player.z));
      if (name !== scratch.location) {
        scratch.location = name;
        bridge.emit("location", { name });
      }
    }
    scratch.positionTimer += delta;
    if (scratch.positionTimer >= POSITION_EVERY) {
      scratch.positionTimer = 0;
      scratch.position.x = player.x;
      scratch.position.y = player.z;
      bridge.emit("position", scratch.position);
    }
  }, -2);

  // Camera rig: eased quarter turns, a damped follow clamped to the map, and zoom.
  useFrame(({ camera: view, size }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const { camera, player, layout, store, reducedMotion } = runtime;
    const turnIndex = store.getState().cameraTurn;
    const turn = scratch.turn;
    if (turnIndex !== scratch.lastTurn) {
      scratch.lastTurn = turnIndex;
      turn.from = camera.yaw;
      turn.to = BASE_YAW + turnIndex * QUARTER;
      turn.t = reducedMotion ? 1 : 0;
    }
    if (turn.t < 1) turn.t = Math.min(1, turn.t + delta / CAMERA.rotateSeconds);
    camera.yaw = turn.from + (turn.to - turn.from) * ease(turn.t);
    camera.rightX = Math.cos(camera.yaw);
    camera.rightZ = -Math.sin(camera.yaw);
    camera.forwardX = -Math.sin(camera.yaw);
    camera.forwardZ = -Math.cos(camera.yaw);

    const follow = reducedMotion ? 1 : 1 - Math.exp(-CAMERA.followRate * delta);
    const margin = CAMERA.boundsMargin;
    const targetX = Math.min(layout.width - margin, Math.max(margin, player.x));
    const targetZ = Math.min(layout.height - margin, Math.max(margin, player.z));
    camera.focusX += (targetX - camera.focusX) * follow;
    camera.focusZ += (targetZ - camera.focusZ) * follow;
    camera.focusY += (player.y + CAMERA.focusHeight - camera.focusY) * follow;
    camera.zoom +=
      (camera.zoomTarget - camera.zoom) *
      (reducedMotion ? 1 : 1 - Math.exp(-CAMERA.zoomRate * delta));

    if (view instanceof THREE.OrthographicCamera) {
      const zoom = (Math.min(size.width, size.height) / CAMERA.unitsOnShortSide) * camera.zoom;
      if (Math.abs(zoom - scratch.zoomApplied) > 1e-3) {
        scratch.zoomApplied = zoom;
        view.zoom = zoom;
        view.updateProjectionMatrix();
      }
    }
    const horizontal = Math.cos(PITCH) * CAMERA.distance;
    view.position.set(
      camera.focusX + Math.sin(camera.yaw) * horizontal,
      camera.focusY + Math.sin(PITCH) * CAMERA.distance,
      camera.focusZ + Math.cos(camera.yaw) * horizontal,
    );
    view.lookAt(camera.focusX, camera.focusY, camera.focusZ);
    view.updateMatrixWorld();

    // Where the HTML prompt goes: above the door of the building the player is at.
    const index = scratch.nearIndex;
    const model = runtime.buildings[index];
    if (model) {
      scratch.anchor.copy(model.prompt).project(view);
      const x = Math.round(((scratch.anchor.x + 1) / 2) * size.width);
      const y = Math.round(((1 - scratch.anchor.y) / 2) * size.height);
      if (x !== scratch.prompt.x || y !== scratch.prompt.y) {
        scratch.prompt.x = x;
        scratch.prompt.y = y;
        runtime.bridge.emit("promptPosition", scratch.prompt);
      }
    }
  }, -1);

  return null;
}
