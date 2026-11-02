import type { CameraTuning } from "@/game/settings/types";
import { THIRD_PERSON } from "@/game3d/config/camera";
import type { CameraCollision } from "./CameraCollision";

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

/** Frame-rate independent exponential smoothing factor for a rate (per second). */
export function damp(rate: number, delta: number): number {
  return 1 - Math.exp(-rate * delta);
}

/** Signed shortest angle from `from` to `to` (radians, in [-π, π]). */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Everything the rig reads each frame (plain numbers, written in place by the caller). */
export interface RigFrame {
  delta: number;
  /** Look input this frame, radians. */
  lookYaw: number;
  lookPitch: number;
  /** Seconds since the last look input. */
  idleLook: number;
  moving: boolean;
  running: boolean;
  /** The way the player faces: the direction (sin h, cos h) on the ground. */
  heading: number;
  /** The player's feet. */
  x: number;
  y: number;
  z: number;
  reducedMotion: boolean;
  autoRecenter: boolean;
  /** Screen width / height: narrow (portrait) screens get a smaller shoulder offset. */
  aspect: number;
}

export function createRigFrame(): RigFrame {
  return {
    delta: 0,
    lookYaw: 0,
    lookPitch: 0,
    idleLook: 0,
    moving: false,
    running: false,
    heading: 0,
    x: 0,
    y: 0,
    z: 0,
    reducedMotion: false,
    autoRecenter: true,
    aspect: 16 / 9,
  };
}

/**
 * The third-person camera: a spring arm from a pivot at the player's head, swung by yaw and
 * pitch, offset over the right shoulder. Position, yaw and pitch are smoothed separately with
 * frame-rate independent damping; the arm is pulled in at once when something gets between
 * the camera and the player and eases back out; running widens the view a little; and after
 * a while without look input it swings back behind the player. Pure math, no three.js.
 *
 * Yaw convention (shared with the isometric view): the camera sits at
 * aim + (sin yaw · cos pitch, sin pitch, cos yaw · cos pitch) · distance.
 */
export class ThirdPersonRig {
  yaw = 0;
  pitch = THIRD_PERSON.defaultPitch * DEG;
  yawTarget = 0;
  pitchTarget = THIRD_PERSON.defaultPitch * DEG;
  /** The wanted arm length (wheel and pinch change it) and the current one after collision. */
  armTarget: number = THIRD_PERSON.armLength;
  arm: number = THIRD_PERSON.armLength;
  fov: number = THIRD_PERSON.fov;
  /** Shoulder offset after collision with walls on the right. */
  shoulder: number = THIRD_PERSON.shoulderOffset;
  /** Player opacity: below 1 when the camera is very close. */
  fade = 1;
  /** Smoothed head pivot, the aim point (pivot + shoulder) and the final camera position. */
  readonly pivot = { x: 0, y: 0, z: 0 };
  readonly aim = { x: 0, y: 0, z: 0 };
  readonly position = { x: 0, y: 0, z: 0 };
  private initialized = false;

  constructor(readonly tuning: CameraTuning) {}

  /** Puts the camera behind a heading right away (entering the view) or smoothly (C key). */
  placeBehind(heading: number, immediate: boolean): void {
    this.yawTarget = this.yaw + angleDelta(this.yaw, heading + Math.PI);
    this.pitchTarget = THIRD_PERSON.defaultPitch * DEG;
    if (immediate) {
      this.yaw = this.yawTarget;
      this.pitch = this.pitchTarget;
    }
  }

  /** Entering the view: snap the pivot to the player on the next update, camera behind them. */
  reset(heading: number): void {
    this.initialized = false;
    this.placeBehind(heading, true);
    this.arm = this.armTarget;
  }

  /** Changes the arm length by zoom steps (positive moves closer). */
  zoom(steps: number): void {
    const [min, max] = THIRD_PERSON.armRange;
    this.armTarget = Math.min(max, Math.max(min, this.armTarget * Math.exp(-steps * 0.12)));
  }

  /** Q / R: turn by a fixed step. */
  turn(direction: number): void {
    this.yawTarget += direction * THIRD_PERSON.turnStep * DEG;
  }

  update(frame: RigFrame, collision: CollisionLike): void {
    const { delta } = frame;
    const tuning = this.tuning;
    const rates = frame.reducedMotion ? THIRD_PERSON.reducedMotionDamping : null;
    const positionRate = rates ? rates.position : tuning.positionDamping;
    const yawRate = rates ? rates.yaw : tuning.rotationDamping;
    const pitchRate = rates
      ? rates.pitch
      : tuning.rotationDamping * (THIRD_PERSON.damping.pitch / THIRD_PERSON.damping.yaw);
    const armRate = rates ? rates.armReturn : THIRD_PERSON.damping.armReturn;
    const fovRate = rates ? rates.fov : THIRD_PERSON.damping.fov;

    // Look input moves the targets; pitch is clamped.
    this.yawTarget += frame.lookYaw;
    this.pitchTarget = Math.min(
      THIRD_PERSON.pitchMax * DEG,
      Math.max(THIRD_PERSON.pitchMin * DEG, this.pitchTarget + frame.lookPitch),
    );

    // Auto-recenter: drift back behind a player who walks on without touching the camera
    // (not while walking toward the camera, which would spin the view around).
    if (
      frame.autoRecenter &&
      !frame.reducedMotion &&
      frame.moving &&
      frame.idleLook > THIRD_PERSON.recenterDelay
    ) {
      const behind = frame.heading + Math.PI;
      const offset = angleDelta(this.yawTarget, behind);
      if (Math.abs(offset) < 120 * DEG) {
        this.yawTarget += offset * damp(THIRD_PERSON.recenterRate, delta);
      }
    }

    const headY = frame.y + THIRD_PERSON.pivotHeight;
    if (!this.initialized) {
      this.initialized = true;
      this.pivot.x = frame.x;
      this.pivot.y = headY;
      this.pivot.z = frame.z;
      this.yaw = this.yawTarget;
      this.pitch = this.pitchTarget;
    }
    const follow = damp(positionRate, delta);
    this.pivot.x += (frame.x - this.pivot.x) * follow;
    this.pivot.y += (headY - this.pivot.y) * follow;
    this.pivot.z += (frame.z - this.pivot.z) * follow;
    this.yaw += angleDelta(this.yaw, this.yawTarget) * damp(yawRate, delta);
    this.pitch += (this.pitchTarget - this.pitch) * damp(pitchRate, delta);
    // Keep the targets near the current angle so they never wind up by whole turns.
    this.yawTarget = this.yaw + angleDelta(this.yaw, this.yawTarget);

    const kick = frame.running && !frame.reducedMotion ? THIRD_PERSON.runFovKick : 0;
    this.fov += (tuning.fov + kick - this.fov) * damp(fovRate, delta);

    // Over the shoulder: shorten the offset if a wall is right there.
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const rightX = cos;
    const rightZ = -sin;
    const { radius, minDistance, groundClearance } = THIRD_PERSON.collision;
    // On a portrait phone a full shoulder offset would push the player off to the side.
    const wantedShoulder = tuning.shoulderOffset * Math.min(1, frame.aspect / 1.4);
    const shoulderHit =
      wantedShoulder > 0
        ? collision.cast(
            this.pivot.x,
            this.pivot.y,
            this.pivot.z,
            rightX,
            0,
            rightZ,
            wantedShoulder,
            radius,
            0,
          )
        : 0;
    this.shoulder = Math.max(0, Math.min(wantedShoulder, shoulderHit));
    this.aim.x = this.pivot.x + rightX * this.shoulder;
    this.aim.y = this.pivot.y;
    this.aim.z = this.pivot.z + rightZ * this.shoulder;

    // The arm: sweep from the aim point toward the camera; pull in at once, ease back out.
    const cosPitch = Math.cos(this.pitch);
    const dx = sin * cosPitch;
    const dy = Math.sin(this.pitch);
    const dz = cos * cosPitch;
    const wanted = this.armTarget * (tuning.armLength / THIRD_PERSON.armLength);
    const free = Math.max(
      minDistance,
      collision.cast(
        this.aim.x,
        this.aim.y,
        this.aim.z,
        dx,
        dy,
        dz,
        wanted,
        radius,
        groundClearance,
      ),
    );
    if (free < this.arm) this.arm = free;
    else this.arm += (free - this.arm) * damp(armRate, delta);

    this.position.x = this.aim.x + dx * this.arm;
    this.position.y = this.aim.y + dy * this.arm;
    this.position.z = this.aim.z + dz * this.arm;
    const ground = collision.heightAt(this.position.x, this.position.z) + groundClearance;
    if (this.position.y < ground) this.position.y = ground;

    const span = THIRD_PERSON.fadeDistance - minDistance;
    const near = Math.min(1, Math.max(0, (this.arm - minDistance) / span));
    this.fade = THIRD_PERSON.fadeMin + (1 - THIRD_PERSON.fadeMin) * near;
  }
}

/** The part of CameraCollision the rig uses (tests pass a stand-in). */
export type CollisionLike = Pick<CameraCollision, "cast" | "heightAt">;
