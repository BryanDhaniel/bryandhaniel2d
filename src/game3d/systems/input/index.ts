import type { CameraMode } from "@/game/settings/types";
import { THIRD_PERSON } from "@/game3d/config/camera";
import { arrowsLook, clampUnit, createActions, createQueue, type InputActions } from "./actions";
import { GamepadReader } from "./gamepad";
import { LookHandler } from "./look";

/**
 * Every input source for the 3D village folded into one action map. Keys are read from the
 * focusable game container (so typing in a panel never moves the player); pointer look comes
 * from the canvas; the D-pad, virtual joystick and run toggle arrive over the bridge; gamepads
 * are polled. Movement is camera-relative in both views: "forward" walks away from the camera.
 * In third-person the arrow keys look around instead of walking (W A S D still walk).
 */

const FORWARD = new Set(["KeyW", "ArrowUp"]);
const BACK = new Set(["KeyS", "ArrowDown"]);
const LEFT = new Set(["KeyA", "ArrowLeft"]);
const RIGHT = new Set(["KeyD", "ArrowRight"]);
const ARROWS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const RUN = new Set(["ShiftLeft", "ShiftRight"]);
const INTERACT = new Set(["KeyE", "Enter", "NumpadEnter"]);
const HANDLED = new Set([
  ...FORWARD,
  ...BACK,
  ...LEFT,
  ...RIGHT,
  ...INTERACT,
  "KeyQ",
  "KeyR",
  "KeyC",
  "KeyV",
  "Space",
  "Equal",
  "Minus",
  "NumpadAdd",
  "NumpadSubtract",
]);

export interface TapTarget {
  tileX: number;
  tileZ: number;
  /** Set when a building was tapped: walk to its door, then open it. */
  buildingIndex: number;
}

export interface InputOptions {
  invertY: boolean;
  pointerLock: boolean;
  jump: boolean;
}

export class InputController {
  /** This frame's continuous actions (movement, look, run). */
  readonly actions: InputActions = createActions();
  /** Seconds since the last camera look input (drives auto-recenter). */
  idleLook = 0;
  readonly look = new LookHandler();
  private readonly gamepad = new GamepadReader();
  private readonly queue = createQueue();
  private readonly down = new Set<string>();
  private readonly dpad = { x: 0, y: 0 };
  private readonly joystick = { x: 0, y: 0 };
  private runToggle = false;
  private tap: TapTarget | null = null;
  private target: HTMLElement | null = null;
  private mode: CameraMode = "isometric";
  private options: InputOptions = { invertY: false, pointerLock: false, jump: false };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (HANDLED.has(event.code) && !(event.code === "Space" && !this.options.jump)) {
      event.preventDefault();
    }
    this.down.add(event.code);
    if (event.repeat) return;
    const queue = this.queue;
    if (INTERACT.has(event.code)) queue.interact = true;
    if (event.code === "KeyQ") queue.turn -= 1;
    if (event.code === "KeyR") queue.turn += 1;
    if (event.code === "KeyC") queue.resetCamera = true;
    if (event.code === "KeyV") queue.toggleView = true;
    if (event.code === "Space" && this.options.jump) queue.jump = true;
    if (event.code === "Equal" || event.code === "NumpadAdd") queue.zoom += 1;
    if (event.code === "Minus" || event.code === "NumpadSubtract") queue.zoom -= 1;
    if (
      FORWARD.has(event.code) ||
      BACK.has(event.code) ||
      LEFT.has(event.code) ||
      RIGHT.has(event.code)
    ) {
      this.tap = null;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.down.delete(event.code);
  };

  attach(target: HTMLElement): void {
    this.detach();
    this.target = target;
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
  }

  detach(): void {
    this.target?.removeEventListener("keydown", this.onKeyDown);
    this.target?.removeEventListener("keyup", this.onKeyUp);
    this.target = null;
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    this.look.enabled = mode === "thirdPerson";
    if (mode !== "thirdPerson") this.look.release();
  }

  setOptions(options: InputOptions): void {
    this.options = options;
    this.look.pointerLock = options.pointerLock;
    if (!options.pointerLock) this.look.release();
  }

  /** D-pad direction in screen terms (y down); actions use y forward. */
  setDpad(x: number, y: number): void {
    this.dpad.x = x;
    this.dpad.y = -y;
    if (x !== 0 || y !== 0) this.tap = null;
  }

  /** Analog joystick: x right, y forward. */
  setJoystick(x: number, y: number): void {
    this.joystick.x = x;
    this.joystick.y = y;
    if (x !== 0 || y !== 0) this.tap = null;
  }

  setRunToggle(on: boolean): void {
    this.runToggle = on;
  }

  queueInteract(): void {
    this.queue.interact = true;
  }

  queueTurn(direction: number): void {
    this.queue.turn += direction;
  }

  queueResetCamera(): void {
    this.queue.resetCamera = true;
  }

  queueTap(target: TapTarget): void {
    // While the mouse is captured a click means "look", never "walk there".
    if (this.look.locked) return;
    this.tap = target;
  }

  /** Clears everything held (focus left the game, or a panel opened). */
  reset(): void {
    this.down.clear();
    this.dpad.x = 0;
    this.dpad.y = 0;
    this.joystick.x = 0;
    this.joystick.y = 0;
    this.look.release();
    const { actions } = this;
    actions.move.x = 0;
    actions.move.y = 0;
    actions.look.yaw = 0;
    actions.look.pitch = 0;
    actions.run = false;
  }

  /** Recomputes this frame's actions from keys, pointer, joystick, D-pad and gamepad. */
  update(delta: number): void {
    const { actions } = this;
    const pad = this.gamepad.poll();
    const arrowLook = arrowsLook(this.mode);
    const sensitivity = THIRD_PERSON.sensitivity;
    let x = this.dpad.x + this.joystick.x + pad.move.x;
    let y = this.dpad.y + this.joystick.y + pad.move.y;
    let yawRate = 0;
    let pitchRate = 0;
    let run = this.runToggle || pad.run;
    for (const code of this.down) {
      const arrow = ARROWS.has(code);
      if (arrow && arrowLook) {
        if (code === "ArrowLeft") yawRate += 1;
        else if (code === "ArrowRight") yawRate -= 1;
        else if (code === "ArrowUp") pitchRate -= 1;
        else if (code === "ArrowDown") pitchRate += 1;
        continue;
      }
      if (FORWARD.has(code)) y += 1;
      else if (BACK.has(code)) y -= 1;
      else if (LEFT.has(code)) x -= 1;
      else if (RIGHT.has(code)) x += 1;
      else if (RUN.has(code)) run = true;
    }
    actions.move.x = Math.max(-1, Math.min(1, x));
    actions.move.y = Math.max(-1, Math.min(1, y));
    clampUnit(actions.move);
    actions.run = run;

    // Look, in radians: pointer pixels times sensitivity, plus key and stick rates.
    const invert = this.options.invertY ? -1 : 1;
    const look = this.look;
    let yaw = 0;
    let pitch = 0;
    if (this.mode === "thirdPerson") {
      yaw =
        -look.mouse.x * sensitivity.mouse -
        look.touch.x * sensitivity.touch +
        (yawRate * sensitivity.keys - pad.look.x * sensitivity.gamepad) * delta;
      pitch =
        (look.mouse.y * sensitivity.mouse +
          look.touch.y * sensitivity.touch +
          (pitchRate * sensitivity.keys + pad.look.y * sensitivity.gamepad) * delta) *
        invert;
    }
    look.mouse.x = 0;
    look.mouse.y = 0;
    look.touch.x = 0;
    look.touch.y = 0;
    actions.look.yaw = yaw;
    actions.look.pitch = pitch;
    this.idleLook = yaw !== 0 || pitch !== 0 || look.dragging ? 0 : this.idleLook + delta;

    const queue = this.queue;
    if (pad.pressed.interact) queue.interact = true;
    if (pad.pressed.jump && this.options.jump) queue.jump = true;
    if (pad.pressed.reset) queue.resetCamera = true;
    if (pad.pressed.toggleView) queue.toggleView = true;
    queue.turn += pad.pressed.turn;
  }

  consumeInteract(): boolean {
    const queued = this.queue.interact;
    this.queue.interact = false;
    return queued;
  }

  consumeJump(): boolean {
    const queued = this.queue.jump;
    this.queue.jump = false;
    return queued;
  }

  consumeResetCamera(): boolean {
    const queued = this.queue.resetCamera;
    this.queue.resetCamera = false;
    return queued;
  }

  consumeToggleView(): boolean {
    const queued = this.queue.toggleView;
    this.queue.toggleView = false;
    return queued;
  }

  consumeTurn(): number {
    const turn = this.queue.turn;
    this.queue.turn = 0;
    return Math.sign(turn);
  }

  consumeZoom(): number {
    const zoom = this.queue.zoom;
    this.queue.zoom = 0;
    return zoom;
  }

  consumeTap(): TapTarget | null {
    const tap = this.tap;
    this.tap = null;
    return tap;
  }
}
