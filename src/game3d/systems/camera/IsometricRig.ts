import { CAMERA } from "@/game3d/config/visuals";
import { damp } from "./ThirdPersonRig";

const QUARTER = Math.PI / 2;
export const ISO_BASE_YAW = (CAMERA.yaw * Math.PI) / 180;
export const ISO_PITCH = (CAMERA.pitch * Math.PI) / 180;

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * The diorama view: an orthographic camera at a fixed pitch, turned in eased quarter turns
 * (Q / R) around a focus point that follows the player and stays inside the map, with a
 * smoothed zoom. Pure math; the camera director copies the result onto the camera.
 */
export class IsometricRig {
  yaw = ISO_BASE_YAW;
  readonly focus = { x: 0, y: 0, z: 0 };
  zoom = 1;
  zoomTarget = 1;
  private readonly turn = { from: ISO_BASE_YAW, to: ISO_BASE_YAW, t: 1, index: 0 };
  private initialized = false;

  /** Starts an eased turn to the quarter-turn `index` (or jumps there with reduced motion). */
  setTurn(index: number, immediate: boolean): void {
    const turn = this.turn;
    if (index === turn.index && turn.t >= 1) return;
    turn.index = index;
    turn.from = this.yaw;
    turn.to = ISO_BASE_YAW + index * QUARTER;
    turn.t = immediate ? 1 : 0;
    if (immediate) this.yaw = turn.to;
  }

  /** The quarter-turn index whose yaw is nearest `yaw` (leaving third-person lands there). */
  static nearestTurn(yaw: number): number {
    return Math.round((yaw - ISO_BASE_YAW) / QUARTER);
  }

  zoomBy(steps: number): void {
    this.zoomTarget = Math.min(
      CAMERA.maxZoom,
      Math.max(CAMERA.minZoom, this.zoomTarget * (1 + steps * CAMERA.keyStep)),
    );
  }

  scaleZoom(factor: number): void {
    this.zoomTarget = Math.min(CAMERA.maxZoom, Math.max(CAMERA.minZoom, this.zoomTarget * factor));
  }

  update(
    delta: number,
    player: { x: number; y: number; z: number },
    bounds: { width: number; height: number },
    reducedMotion: boolean,
  ): void {
    const turn = this.turn;
    if (turn.t < 1) turn.t = Math.min(1, turn.t + delta / CAMERA.rotateSeconds);
    this.yaw = turn.from + (turn.to - turn.from) * ease(turn.t);

    const margin = CAMERA.boundsMargin;
    const targetX = Math.min(bounds.width - margin, Math.max(margin, player.x));
    const targetZ = Math.min(bounds.height - margin, Math.max(margin, player.z));
    const targetY = player.y + CAMERA.focusHeight;
    const follow = reducedMotion || !this.initialized ? 1 : damp(CAMERA.followRate, delta);
    this.initialized = true;
    this.focus.x += (targetX - this.focus.x) * follow;
    this.focus.z += (targetZ - this.focus.z) * follow;
    this.focus.y += (targetY - this.focus.y) * follow;
    this.zoom += (this.zoomTarget - this.zoom) * (reducedMotion ? 1 : damp(CAMERA.zoomRate, delta));
  }

  /** World units visible across the screen height (the orthographic frustum). */
  visibleHeight(width: number, height: number): number {
    const zoom = (Math.min(width, height) / CAMERA.unitsOnShortSide) * this.zoom;
    return height / zoom;
  }
}
