import type { CameraMode } from "@/game/settings/types";

/**
 * The shared action map. Every input source (keyboard, mouse and touch look, the D-pad and
 * virtual joystick, gamepads) writes into one of these each frame, and the game only ever
 * reads actions, never devices, so both camera modes share the same movement code.
 */
export interface InputActions {
  /** Movement intent relative to the camera: x right, y forward (away from it), length ≤ 1. */
  move: { x: number; y: number };
  /** Camera look this frame, in radians: yaw (positive turns left) and pitch (positive looks down). */
  look: { yaw: number; pitch: number };
  run: boolean;
}

export function createActions(): InputActions {
  return { move: { x: 0, y: 0 }, look: { yaw: 0, pitch: 0 }, run: false };
}

/** One-shot actions, counted between frames and consumed once. */
export interface ActionQueue {
  interact: boolean;
  jump: boolean;
  resetCamera: boolean;
  toggleView: boolean;
  /** Camera turn steps: -1 (Q, counter-clockwise) or 1 (R). */
  turn: number;
  /** Zoom steps: positive zooms in. */
  zoom: number;
}

export function createQueue(): ActionQueue {
  return { interact: false, jump: false, resetCamera: false, toggleView: false, turn: 0, zoom: 0 };
}

/** Which keys move and which look depends on the view: arrows look in third-person. */
export function arrowsLook(mode: CameraMode): boolean {
  return mode === "thirdPerson";
}

/** Clamps a 2D vector to unit length (diagonals are not faster). */
export function clampUnit(vector: { x: number; y: number }): void {
  const length = Math.hypot(vector.x, vector.y);
  if (length > 1) {
    vector.x /= length;
    vector.y /= length;
  }
}
