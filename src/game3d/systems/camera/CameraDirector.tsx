"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ScreenPoint, Waypoint } from "@/game/bridge";
import { CAMERA_TRANSITION, THIRD_PERSON } from "@/game3d/config/camera";
import { CAMERA, QUALITY_TIERS, WAYPOINTS } from "@/game3d/config/visuals";
import { useRuntime } from "@/game3d/runtime";
import { createPose, framingDistance, posePosition } from "./CameraModeManager";
import { ISO_PITCH, IsometricRig } from "./IsometricRig";
import { createRigFrame } from "./ThirdPersonRig";

/**
 * Runs the camera every frame (after movement, before anything renders): applies camera
 * input for the active view, updates the isometric and third-person rigs, blends them while
 * the view switches, makes the right camera the default one (the orthographic camera for the
 * isometric view, a perspective camera otherwise), and publishes the view to the runtime.
 * Then it places the HTML prompt over the active doorway and the third-person waypoints.
 */
export function CameraDirector() {
  const runtime = useRuntime();
  const gl = useThree((state) => state.gl);
  const set = useThree((state) => state.set);
  const get = useThree((state) => state.get);

  const rig = useMemo(
    () => ({
      perspective: new THREE.PerspectiveCamera(
        THIRD_PERSON.fov,
        1,
        THIRD_PERSON.near,
        THIRD_PERSON.far,
      ),
      ortho: null as THREE.OrthographicCamera | null,
      frame: createRigFrame(),
      iso: createPose(),
      third: createPose(),
      mixed: createPose(),
      position: { x: 0, y: 0, z: 0 },
      zoomApplied: 0,
      lastTurn: 0,
      lastMode: runtime.views.modes.mode,
      anchor: new THREE.Vector3(),
      prompt: { x: Number.NaN, y: Number.NaN } as ScreenPoint,
      nearIndex: -1,
      waypoints: [] as Waypoint[],
      waypointsShown: false,
    }),
    [runtime],
  );

  // Remember the canvas's orthographic camera, and give it back when this unmounts.
  useEffect(() => {
    const initial = get().camera;
    if (initial instanceof THREE.OrthographicCamera) rig.ortho = initial;
    return () => {
      if (rig.ortho) set({ camera: rig.ortho });
    };
  }, [get, set, rig]);

  // Pointer look on the canvas, and mouse wheel / pinch zoom for both views.
  useEffect(() => {
    const element = gl.domElement;
    const { input, bridge, views } = runtime;
    input.look.attach(element, (locked) => bridge.emit("pointerLock", { locked }));
    const zoom = (factor: number) => {
      if (views.modes.mode === "thirdPerson") views.third.zoom(Math.log(factor) / 0.12);
      else views.iso.scaleZoom(factor);
    };
    const onWheel = (event: WheelEvent) => zoom(Math.exp(-event.deltaY * CAMERA.wheelStep));
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
      if (touches.size === 2) {
        pinch = spread();
        input.look.cancelDrag();
      }
    };
    const onMove = (event: PointerEvent) => {
      const touch = touches.get(event.pointerId);
      if (!touch) return;
      touch.x = event.clientX;
      touch.y = event.clientY;
      if (touches.size === 2 && pinch > 0) {
        const next = spread();
        zoom(next / pinch);
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
      input.look.detach();
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerup", onUp);
      element.removeEventListener("pointercancel", onUp);
    };
  }, [gl, runtime]);

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const { views, player, layout, store, input, reducedMotion, camera } = runtime;
    const { iso, third, modes } = views;
    const settings = store.getState();
    const paused = settings.paused;

    // View switches from the HUD (or V / Back on a gamepad, which ask the HUD to persist it).
    if (!paused && input.consumeToggleView()) {
      const next = modes.mode === "thirdPerson" ? "isometric" : "thirdPerson";
      runtime.bridge.emit("cameraMode", { mode: next });
      settings.setCameraMode(next);
    }
    const mode = store.getState().cameraMode;
    if (mode !== rig.lastMode) {
      rig.lastMode = mode;
      if (mode === "thirdPerson") {
        third.reset(player.heading);
      } else {
        const turn = IsometricRig.nearestTurn(third.yaw);
        settings.setCameraTurn(turn);
        rig.lastTurn = turn;
        iso.setTurn(turn, true);
      }
      input.setMode(mode);
      modes.setMode(mode, reducedMotion);
    }

    // Camera input for the active view.
    const turn = paused ? 0 : input.consumeTurn();
    const zoomSteps = paused ? 0 : input.consumeZoom();
    const reset = !paused && input.consumeResetCamera();
    if (mode === "thirdPerson") {
      if (turn !== 0) third.turn(turn);
      if (zoomSteps !== 0) third.zoom(zoomSteps);
      if (reset) third.placeBehind(player.heading, reducedMotion);
    } else {
      if (turn !== 0) settings.turnCamera(turn > 0 ? 1 : -1);
      if (zoomSteps !== 0) iso.zoomBy(zoomSteps);
      if (reset) {
        settings.setCameraTurn(0);
        iso.scaleZoom(1 / iso.zoomTarget);
      }
    }
    const turnIndex = store.getState().cameraTurn;
    if (turnIndex !== rig.lastTurn) {
      rig.lastTurn = turnIndex;
      iso.setTurn(turnIndex, reducedMotion);
    }

    // Rigs.
    modes.update(reducedMotion ? 1 : delta);
    iso.update(delta, player, layout, reducedMotion);
    if (modes.perspective || mode === "thirdPerson") {
      const frame = rig.frame;
      frame.delta = delta;
      frame.lookYaw = paused ? 0 : input.actions.look.yaw;
      frame.lookPitch = paused ? 0 : input.actions.look.pitch;
      frame.idleLook = input.idleLook;
      frame.moving = player.moving;
      frame.running = player.running;
      frame.heading = player.heading;
      frame.x = player.x;
      frame.y = player.y;
      frame.z = player.z;
      frame.reducedMotion = reducedMotion;
      frame.autoRecenter = runtime.cameraOptions.autoRecenter;
      frame.aspect = state.size.width / Math.max(1, state.size.height);
      third.update(frame, views.collision);
    }

    // Poses: the isometric view (as a narrow-angle perspective stand-in) and the third-person one.
    const { width, height } = state.size;
    const isoPose = rig.iso;
    isoPose.targetX = iso.focus.x;
    isoPose.targetY = iso.focus.y;
    isoPose.targetZ = iso.focus.z;
    isoPose.yaw = iso.yaw;
    isoPose.pitch = ISO_PITCH;
    isoPose.fov = CAMERA_TRANSITION.isoFov;
    isoPose.distance = framingDistance(iso.visibleHeight(width, height), CAMERA_TRANSITION.isoFov);
    const thirdPose = rig.third;
    const dx = third.position.x - third.aim.x;
    const dy = third.position.y - third.aim.y;
    const dz = third.position.z - third.aim.z;
    thirdPose.targetX = third.aim.x;
    thirdPose.targetY = third.aim.y;
    thirdPose.targetZ = third.aim.z;
    thirdPose.distance = Math.max(1e-3, Math.hypot(dx, dy, dz));
    thirdPose.yaw = Math.atan2(dx, dz);
    thirdPose.pitch = Math.asin(Math.max(-1, Math.min(1, dy / thirdPose.distance)));
    thirdPose.fov = third.fov;

    let view: THREE.OrthographicCamera | THREE.PerspectiveCamera;
    if (!modes.perspective && rig.ortho) {
      const ortho = rig.ortho;
      const zoom = (Math.min(width, height) / CAMERA.unitsOnShortSide) * iso.zoom;
      if (
        ortho.left !== -width / 2 ||
        ortho.top !== height / 2 ||
        Math.abs(zoom - rig.zoomApplied) > 1e-3
      ) {
        // R3F only keeps the default camera sized, so refresh it after third-person.
        ortho.left = -width / 2;
        ortho.right = width / 2;
        ortho.top = height / 2;
        ortho.bottom = -height / 2;
        rig.zoomApplied = zoom;
        ortho.zoom = zoom;
        ortho.updateProjectionMatrix();
      }
      const horizontal = Math.cos(ISO_PITCH) * CAMERA.distance;
      ortho.position.set(
        iso.focus.x + Math.sin(iso.yaw) * horizontal,
        iso.focus.y + Math.sin(ISO_PITCH) * CAMERA.distance,
        iso.focus.z + Math.cos(iso.yaw) * horizontal,
      );
      ortho.lookAt(iso.focus.x, iso.focus.y, iso.focus.z);
      ortho.updateMatrixWorld();
      view = ortho;
      camera.yaw = iso.yaw;
      camera.focusX = iso.focus.x;
      camera.focusY = iso.focus.y;
      camera.focusZ = iso.focus.z;
    } else {
      const pose = rig.mixed;
      if (modes.blend >= 1) {
        Object.assign(pose, thirdPose);
      } else {
        modes.mix(isoPose, thirdPose, pose);
        // The swoop between the views keeps out of roofs and trees like the spring arm does.
        const cosPitch = Math.cos(pose.pitch);
        const { radius, minDistance, groundClearance } = THIRD_PERSON.collision;
        const free = views.collision.cast(
          pose.targetX,
          pose.targetY,
          pose.targetZ,
          Math.sin(pose.yaw) * cosPitch,
          Math.sin(pose.pitch),
          Math.cos(pose.yaw) * cosPitch,
          pose.distance,
          radius,
          groundClearance,
        );
        pose.distance = Math.max(minDistance, Math.min(pose.distance, free));
      }
      const persp = rig.perspective;
      const aspect = width / Math.max(1, height);
      const near = Math.max(THIRD_PERSON.near, pose.distance * 0.012);
      const far = THIRD_PERSON.far + pose.distance;
      if (
        persp.fov !== pose.fov ||
        persp.aspect !== aspect ||
        persp.near !== near ||
        persp.far !== far
      ) {
        persp.fov = pose.fov;
        persp.aspect = aspect;
        persp.near = near;
        persp.far = far;
        persp.updateProjectionMatrix();
      }
      posePosition(pose, rig.position);
      persp.position.set(rig.position.x, rig.position.y, rig.position.z);
      persp.lookAt(pose.targetX, pose.targetY, pose.targetZ);
      persp.updateMatrixWorld();
      view = persp;
      camera.yaw = pose.yaw;
      camera.focusX = pose.targetX;
      camera.focusY = pose.targetY;
      camera.focusZ = pose.targetZ;
    }
    camera.rightX = Math.cos(camera.yaw);
    camera.rightZ = -Math.sin(camera.yaw);
    camera.forwardX = -Math.sin(camera.yaw);
    camera.forwardZ = -Math.cos(camera.yaw);
    camera.x = view.position.x;
    camera.y = view.position.y;
    camera.z = view.position.z;
    camera.blend = modes.eased;
    camera.perspective = modes.perspective;
    if (state.camera !== view) set({ camera: view });
    // Grass and flowers shrink away toward the tier's draw distance (never in isometric).
    const reach = QUALITY_TIERS[settings.level].drawDistance;
    if (modes.perspective) runtime.uniforms.uFadeRange.value.set(reach * 0.45, reach * 0.6);
    else runtime.uniforms.uFadeRange.value.set(1e4, 1e4 + 1);

    projectPrompt(view, width, height);
    projectWaypoints(view, width, height, mode === "thirdPerson" && modes.blend >= 1);
  }, -1);

  /** Where the HTML prompt goes: above the door of the building the player is at. */
  function projectPrompt(view: THREE.Camera, width: number, height: number) {
    const index = runtime.nearIndex;
    if (index !== rig.nearIndex) {
      rig.nearIndex = index;
      rig.prompt.x = Number.NaN;
    }
    const model = runtime.buildings[index];
    if (!model) return;
    rig.anchor.copy(model.prompt).project(view);
    const x = Math.round(((rig.anchor.x + 1) / 2) * width);
    const y = Math.round(((1 - rig.anchor.y) / 2) * height);
    if (x !== rig.prompt.x || y !== rig.prompt.y) {
      rig.prompt.x = x;
      rig.prompt.y = y;
      runtime.bridge.emit("promptPosition", rig.prompt);
    }
  }

  /** Floating building markers (third-person only), faded by distance. */
  function projectWaypoints(view: THREE.Camera, width: number, height: number, active: boolean) {
    const { landmarks, player } = runtime;
    const list = rig.waypoints;
    if (list.length !== landmarks.length) {
      list.length = 0;
      for (const landmark of landmarks) {
        list.push({
          sectionId: landmark.sectionId,
          label: landmark.label,
          x: 0,
          y: 0,
          distance: 0,
          opacity: 0,
          visible: false,
        });
      }
    }
    if (!active) {
      if (rig.waypointsShown) {
        rig.waypointsShown = false;
        for (const waypoint of list) waypoint.visible = false;
        runtime.bridge.emit("waypoints", list);
      }
      return;
    }
    rig.waypointsShown = true;
    for (let i = 0; i < landmarks.length; i += 1) {
      const landmark = landmarks[i];
      const waypoint = list[i];
      if (!landmark || !waypoint) continue;
      const distance = Math.hypot(landmark.doorX - player.x, landmark.doorZ - player.z);
      rig.anchor.set(landmark.x, landmark.y, landmark.z).project(view);
      const onScreen =
        rig.anchor.z < 1 && Math.abs(rig.anchor.x) < 1.1 && Math.abs(rig.anchor.y) < 1.1;
      const near = Math.min(1, Math.max(0, (distance - WAYPOINTS.hideWithin) / WAYPOINTS.fadeIn));
      const far = Math.min(1, Math.max(0, (WAYPOINTS.fadeOut - distance) / WAYPOINTS.fadeIn));
      waypoint.distance = distance;
      waypoint.opacity = near * far;
      waypoint.visible = onScreen && waypoint.opacity > 0.02;
      waypoint.x = ((rig.anchor.x + 1) / 2) * width;
      waypoint.y = ((1 - rig.anchor.y) / 2) * height;
    }
    runtime.bridge.emit("waypoints", list);
  }

  return null;
}
