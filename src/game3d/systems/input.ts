/**
 * Keyboard, D-pad and tap input for the 3D village. Keys are read from the focusable game
 * container (so typing in a panel never moves the player). Movement is screen-relative: "up"
 * walks away from the camera whatever way it has been turned.
 */

const UP = new Set(["ArrowUp", "KeyW"]);
const DOWN = new Set(["ArrowDown", "KeyS"]);
const LEFT = new Set(["ArrowLeft", "KeyA"]);
const RIGHT = new Set(["ArrowRight", "KeyD"]);
const RUN = new Set(["ShiftLeft", "ShiftRight"]);
const INTERACT = new Set(["KeyE", "Enter", "NumpadEnter"]);
const HANDLED = new Set([
  ...UP,
  ...DOWN,
  ...LEFT,
  ...RIGHT,
  ...INTERACT,
  "KeyQ",
  "KeyR",
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

export class InputController {
  /** Screen-relative intent from keys and D-pad: x right, y up, each -1..1. */
  readonly intent = { x: 0, y: 0 };
  run = false;
  private readonly down = new Set<string>();
  private readonly dpad = { x: 0, y: 0 };
  private interactQueued = false;
  private turnQueued = 0;
  private zoomQueued = 0;
  private tap: TapTarget | null = null;
  private target: HTMLElement | null = null;

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (HANDLED.has(event.code)) event.preventDefault();
    if (event.repeat) {
      this.down.add(event.code);
      return;
    }
    this.down.add(event.code);
    if (INTERACT.has(event.code)) this.interactQueued = true;
    if (event.code === "KeyQ") this.turnQueued -= 1;
    if (event.code === "KeyR") this.turnQueued += 1;
    if (event.code === "Equal" || event.code === "NumpadAdd") this.zoomQueued += 1;
    if (event.code === "Minus" || event.code === "NumpadSubtract") this.zoomQueued -= 1;
    if (
      UP.has(event.code) ||
      DOWN.has(event.code) ||
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

  /** D-pad direction in screen terms (y down); intent uses y up. */
  setDpad(x: number, y: number): void {
    this.dpad.x = x;
    this.dpad.y = -y;
    if (x !== 0 || y !== 0) this.tap = null;
  }

  queueInteract(): void {
    this.interactQueued = true;
  }

  queueTurn(direction: number): void {
    this.turnQueued += direction;
  }

  queueTap(target: TapTarget): void {
    this.tap = target;
  }

  reset(): void {
    this.down.clear();
    this.dpad.x = 0;
    this.dpad.y = 0;
    this.run = false;
    this.intent.x = 0;
    this.intent.y = 0;
  }

  /** Recomputes `intent` and `run` from the held keys and the D-pad. */
  update(): void {
    let x = this.dpad.x;
    let y = this.dpad.y;
    for (const code of this.down) {
      if (UP.has(code)) y += 1;
      else if (DOWN.has(code)) y -= 1;
      else if (LEFT.has(code)) x -= 1;
      else if (RIGHT.has(code)) x += 1;
    }
    x = Math.max(-1, Math.min(1, x));
    y = Math.max(-1, Math.min(1, y));
    const length = Math.hypot(x, y);
    this.intent.x = length > 1 ? x / length : x;
    this.intent.y = length > 1 ? y / length : y;
    let run = false;
    for (const code of this.down) {
      if (RUN.has(code)) run = true;
    }
    this.run = run;
  }

  consumeInteract(): boolean {
    const queued = this.interactQueued;
    this.interactQueued = false;
    return queued;
  }

  consumeTurn(): number {
    const turn = this.turnQueued;
    this.turnQueued = 0;
    return Math.sign(turn);
  }

  consumeZoom(): number {
    const zoom = this.zoomQueued;
    this.zoomQueued = 0;
    return zoom;
  }

  consumeTap(): TapTarget | null {
    const tap = this.tap;
    this.tap = null;
    return tap;
  }
}
