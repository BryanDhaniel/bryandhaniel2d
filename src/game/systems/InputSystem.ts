import * as Phaser from "phaser";
import { PLAYER } from "@/game/constants";
import { PathFollower, type Steer } from "./pathFollower";
import type { GridPathfinder } from "./pathfinding";

type Direction = "up" | "down" | "left" | "right";

const KEY_CODES: Record<Direction, readonly number[]> = {
  up: [Phaser.Input.Keyboard.KeyCodes.W, Phaser.Input.Keyboard.KeyCodes.UP],
  down: [Phaser.Input.Keyboard.KeyCodes.S, Phaser.Input.Keyboard.KeyCodes.DOWN],
  left: [Phaser.Input.Keyboard.KeyCodes.A, Phaser.Input.Keyboard.KeyCodes.LEFT],
  right: [Phaser.Input.Keyboard.KeyCodes.D, Phaser.Input.Keyboard.KeyCodes.RIGHT],
};

// Not Space: its keyup lands on the panel's focused close button and would click it.
const INTERACT_CODES = [Phaser.Input.Keyboard.KeyCodes.E, Phaser.Input.Keyboard.KeyCodes.ENTER];

function anyDown(keys: readonly Phaser.Input.Keyboard.Key[]): boolean {
  for (const key of keys) {
    if (key.isDown) return true;
  }
  return false;
}

/**
 * Merges keyboard (WASD + arrows), the on-screen D-pad and tap-to-move into one movement
 * intent per frame. Keyboard and D-pad override an active tap path.
 */
export class InputSystem {
  /** Desired movement this frame; magnitude ≤ 1. Reused every frame. */
  readonly intent = new Phaser.Math.Vector2();
  run = false;
  private readonly keys: Record<Direction, Phaser.Input.Keyboard.Key[]>;
  private readonly runKey: Phaser.Input.Keyboard.Key | null;
  private readonly dpad = { x: 0, y: 0 };
  private readonly steer: Steer = { x: 0, y: 0 };
  private readonly follower: PathFollower;
  private paused = false;
  private interactQueued = false;
  private pathArrived = false;

  constructor(
    private readonly scene: Phaser.Scene,
    finder: GridPathfinder,
  ) {
    const keyboard = scene.input.keyboard;
    const make = (code: number) => keyboard?.addKey(code, true, false) ?? null;
    const collect = (codes: readonly number[]) =>
      codes.map(make).filter((key): key is Phaser.Input.Keyboard.Key => key !== null);
    this.keys = {
      up: collect(KEY_CODES.up),
      down: collect(KEY_CODES.down),
      left: collect(KEY_CODES.left),
      right: collect(KEY_CODES.right),
    };
    // Listen for the press itself rather than polling JustDown: Key.onUp clears the
    // "just down" flag, so a press released within the same frame would be lost.
    for (const key of collect(INTERACT_CODES)) {
      key.on(Phaser.Input.Keyboard.Events.DOWN, this.queueInteract, this);
    }
    this.runKey = make(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.follower = new PathFollower(finder, finder.width * finder.height);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** True on the frame a tap-to-move path finished. */
  get arrived(): boolean {
    return this.pathArrived;
  }

  get following(): boolean {
    return this.follower.active;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.cancelPath();
    this.reset();
  }

  setDpad(x: number, y: number): void {
    this.dpad.x = x;
    this.dpad.y = y;
    if (x !== 0 || y !== 0) {
      this.cancelPath();
    }
  }

  queueInteract(): void {
    if (!this.paused) {
      this.interactQueued = true;
    }
  }

  /** Clears held keys, e.g. when the canvas loses focus mid-press. */
  reset(): void {
    this.scene.input.keyboard?.resetKeys();
    this.dpad.x = 0;
    this.dpad.y = 0;
    this.intent.set(0, 0);
    this.interactQueued = false;
  }

  /** Plans a tap-to-move route. Returns false if the tile can't be reached. */
  walkTo(fromTileX: number, fromTileY: number, toTileX: number, toTileY: number): boolean {
    if (this.paused) {
      return false;
    }
    return this.follower.plan(fromTileX, fromTileY, toTileX, toTileY);
  }

  cancelPath(): void {
    this.follower.cancel();
    this.pathArrived = false;
  }

  /** Returns true once per press of E / Enter (or the touch A button). */
  consumeInteract(): boolean {
    const pressed = this.interactQueued;
    this.interactQueued = false;
    return pressed && !this.paused;
  }

  /** Call once per frame with the player's physics-body centre. */
  update(bodyX: number, bodyY: number, delta: number): void {
    this.pathArrived = false;
    if (this.paused) {
      this.intent.set(0, 0);
      this.run = false;
      return;
    }
    let x = (anyDown(this.keys.right) ? 1 : 0) - (anyDown(this.keys.left) ? 1 : 0);
    let y = (anyDown(this.keys.down) ? 1 : 0) - (anyDown(this.keys.up) ? 1 : 0);
    if (x === 0 && y === 0) {
      x = this.dpad.x;
      y = this.dpad.y;
    }
    this.run = this.runKey?.isDown ?? false;

    if (x !== 0 || y !== 0) {
      this.cancelPath();
      const length = Math.hypot(x, y);
      this.intent.set(x / length, y / length);
      return;
    }

    if (this.follower.active) {
      if (this.follower.steer(bodyX, bodyY, this.steer)) {
        // Slow down on the final approach so we stop exactly on the waypoint.
        const length = Math.hypot(this.steer.x, this.steer.y);
        const step = (PLAYER.speed * delta) / 1000;
        const factor = Math.min(1, length / Math.max(step, 0.001));
        this.intent.set((this.steer.x / length) * factor, (this.steer.y / length) * factor);
        return;
      }
      this.pathArrived = this.follower.arrived;
    }
    this.intent.set(0, 0);
  }
}
