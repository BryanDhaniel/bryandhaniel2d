import type { CameraMode } from "@/game/settings/types";
import { CAMERA_TRANSITION } from "@/game3d/config/camera";
import { angleDelta } from "./ThirdPersonRig";

const DEG = Math.PI / 180;

/** A camera described the way both views can share: an aim point seen from yaw, pitch and distance. */
export interface CameraPose {
  targetX: number;
  targetY: number;
  targetZ: number;
  yaw: number;
  pitch: number;
  distance: number;
  /** Vertical field of view in degrees. */
  fov: number;
}

export function createPose(): CameraPose {
  return { targetX: 0, targetY: 0, targetZ: 0, yaw: 0, pitch: 0, distance: 1, fov: 60 };
}

/** Camera position for a pose. */
export function posePosition(pose: CameraPose, out: { x: number; y: number; z: number }): void {
  const cosPitch = Math.cos(pose.pitch);
  out.x = pose.targetX + Math.sin(pose.yaw) * cosPitch * pose.distance;
  out.y = pose.targetY + Math.sin(pose.pitch) * pose.distance;
  out.z = pose.targetZ + Math.cos(pose.yaw) * cosPitch * pose.distance;
}

/** Distance at which a perspective camera with `fov` sees `height` world units at its target. */
export function framingDistance(height: number, fov: number): number {
  return height / 2 / Math.tan((fov * DEG) / 2);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Switches between the isometric and the third-person view with a blended ~0.8 s transition.
 * The blend runs on a perspective camera from a narrow-angle stand-in for the orthographic
 * view (framed identically) to the third-person pose, interpolating the aim point, yaw (the
 * short way round), pitch, the log of the distance and the log of the field of view, so the
 * framing changes at an even rate. Fully isometric, the real orthographic camera takes over.
 */
export class CameraModeManager {
  mode: CameraMode;
  /** 0 = isometric, 1 = third-person. */
  blend: number;

  constructor(mode: CameraMode) {
    this.mode = mode;
    this.blend = mode === "thirdPerson" ? 1 : 0;
  }

  setMode(mode: CameraMode, immediate: boolean): void {
    this.mode = mode;
    if (immediate) this.blend = mode === "thirdPerson" ? 1 : 0;
  }

  update(delta: number): void {
    const target = this.mode === "thirdPerson" ? 1 : 0;
    const step = delta / CAMERA_TRANSITION.seconds;
    this.blend =
      target > this.blend
        ? Math.min(target, this.blend + step)
        : Math.max(target, this.blend - step);
  }

  /** The perspective camera is in use (third-person, or blending). */
  get perspective(): boolean {
    return this.blend > 0;
  }

  get transitioning(): boolean {
    return this.blend > 0 && this.blend < 1;
  }

  /** Eased blend factor. */
  get eased(): number {
    return easeInOut(this.blend);
  }

  /** Blends two poses into `out` by the eased blend factor. */
  mix(iso: CameraPose, third: CameraPose, out: CameraPose): void {
    const t = this.eased;
    out.targetX = iso.targetX + (third.targetX - iso.targetX) * t;
    out.targetY = iso.targetY + (third.targetY - iso.targetY) * t;
    out.targetZ = iso.targetZ + (third.targetZ - iso.targetZ) * t;
    out.yaw = iso.yaw + angleDelta(iso.yaw, third.yaw) * t;
    out.pitch = iso.pitch + (third.pitch - iso.pitch) * t;
    out.distance = Math.exp(
      Math.log(iso.distance) + (Math.log(third.distance) - Math.log(iso.distance)) * t,
    );
    const tanIso = Math.log(Math.tan((iso.fov * DEG) / 2));
    const tanThird = Math.log(Math.tan((third.fov * DEG) / 2));
    out.fov = (2 * Math.atan(Math.exp(tanIso + (tanThird - tanIso) * t))) / DEG;
  }
}
