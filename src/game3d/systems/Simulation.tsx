"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import { areaNameAt } from "@/game/map/village";
import { THIRD_PERSON } from "@/game3d/config/camera";
import { CLOUDS, INTERACT, MOVE, QUALITY_TIERS, WEATHER, WIND } from "@/game3d/config/visuals";
import { useRuntime, type WorldRuntime } from "@/game3d/runtime";
import { useAssets } from "@/game3d/scene/assets";
import { angleDelta, damp } from "@/game3d/systems/camera/ThirdPersonRig";
import { inZone, terrainHeight } from "@/game3d/world/layout";

const LOCATION_EVERY = 0.25;
const POSITION_EVERY = 0.1;
const CONE_COS = Math.cos((INTERACT.cone * Math.PI) / 180);

/**
 * The doorway the player can use. In the isometric view: the doorway zone they stand in. In
 * third-person: the nearest door within range that is also inside the camera's view cone,
 * so what is highlighted is what the visitor is looking at.
 */
function findInteractable(runtime: WorldRuntime): number {
  const { layout, player, camera } = runtime;
  const buildings = layout.buildings;
  if (camera.blend < 0.5) {
    for (let index = 0; index < buildings.length; index += 1) {
      const building = buildings[index];
      if (building && inZone(building.zone, player.x, player.z)) return index;
    }
    return -1;
  }
  let best = -1;
  let bestScore = Infinity;
  for (let index = 0; index < buildings.length; index += 1) {
    const building = buildings[index];
    if (!building) continue;
    const dx = building.doorX - player.x;
    const dz = building.doorZ - player.z;
    const distance = Math.hypot(dx, dz);
    if (distance > INTERACT.range) continue;
    // Standing right in the doorway always counts; otherwise it must be in view.
    const facing = distance < 0.6 ? 1 : (dx * camera.forwardX + dz * camera.forwardZ) / distance;
    if (facing < CONE_COS) continue;
    const score = distance + (1 - facing) * 2;
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}

/**
 * The game loop (priority -2, before the camera director): input, camera-relative movement
 * with smooth turning, collision, gravity and ground snapping, doorways and panels, the clock,
 * weather and shared shader inputs. Everything runs before rendering and allocates nothing.
 */
export function Simulation() {
  const runtime = useRuntime();
  const assets = useAssets();

  const scratch = useMemo(
    () => ({
      steer: { x: 0, z: 0 },
      locationTimer: 0,
      positionTimer: 0,
      location: "",
      phase: "",
      moved: false,
      nearIndex: -1,
      position: { x: 0, y: 0, heading: 0, viewYaw: 0 },
    }),
    [],
  );

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

    input.update(delta);

    // Quick travel: straight to a doorway, facing the door (the HUD covers it with a fade).
    const teleport = runtime.teleport;
    if (teleport >= 0) {
      runtime.teleport = -1;
      const building = layout.buildings[teleport];
      if (building) {
        runtime.path.cancel();
        player.pendingBuilding = -1;
        player.x = building.approachX + 0.5;
        player.z = building.approachZ + 0.5;
        player.y = terrainHeight(layout, player.x, player.z, MOVE.ramp);
        player.vy = 0;
        player.airborne = false;
        player.heading = Math.atan2(building.doorX - player.x, building.doorZ - player.z);
        runtime.views.third.reset(player.heading);
        runtime.views.iso.focus.x = player.x;
        runtime.views.iso.focus.z = player.z;
      }
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

    // Movement relative to the camera; otherwise follow the planned path.
    let dirX = 0;
    let dirZ = 0;
    const { move } = input.actions;
    let run = input.actions.run;
    if (move.x !== 0 || move.y !== 0) {
      runtime.path.cancel();
      player.pendingBuilding = -1;
      dirX = camera.rightX * move.x + camera.forwardX * move.y;
      dirZ = camera.rightZ * move.x + camera.forwardZ * move.y;
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
      // Turn toward the way we walk at a steady rate.
      const turn = angleDelta(player.heading, Math.atan2(dirX, dirZ));
      const step = THIRD_PERSON.turnSpeed * delta;
      player.heading += Math.abs(turn) <= step ? turn : Math.sign(turn) * step;
      if (!scratch.moved) {
        scratch.moved = true;
        bridge.emit("moved", null);
      }
    }

    // Gravity, the optional jump and ground snapping (smoothed over tile steps).
    const ground = terrainHeight(layout, player.x, player.z, MOVE.ramp);
    if (input.consumeJump() && !player.airborne) {
      player.vy = MOVE.jumpSpeed;
      player.airborne = true;
    }
    if (!player.airborne && player.y - ground > MOVE.snapDistance) {
      player.airborne = true;
      player.vy = 0;
    }
    if (player.airborne) {
      player.vy -= MOVE.gravity * delta;
      player.y += player.vy * delta;
      if (player.y <= ground) {
        player.y = ground;
        player.vy = 0;
        player.airborne = false;
        runtime.audio.play("step");
      }
    } else {
      player.y += (ground - player.y) * damp(MOVE.heightRate, delta);
    }

    // Doorways: the prompt, the highlight, the cutaway and opening panels.
    const nearIndex = findInteractable(runtime);
    runtime.nearIndex = nearIndex;
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
      const position = scratch.position;
      position.x = player.x;
      position.y = player.z;
      // Map angles: 0 = up on the map (north, -z), clockwise.
      position.heading = Math.PI - player.heading;
      position.viewYaw = -camera.yaw;
      bridge.emit("position", position);
    }
  }, -2);

  return null;
}
