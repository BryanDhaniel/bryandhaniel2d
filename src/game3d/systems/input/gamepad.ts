/**
 * Polls the first connected gamepad (standard mapping) once per frame: left stick moves,
 * right stick looks, A interacts, Y jumps, LB / RB turn the camera, RT or L3 runs, R3 resets
 * the camera and Back / Select switches the view. No-op where the Gamepad API is missing.
 */

const DEADZONE = 0.18;

const BUTTON = {
  a: 0,
  y: 3,
  lb: 4,
  rb: 5,
  rt: 7,
  back: 8,
  l3: 10,
  r3: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

export interface GamepadState {
  connected: boolean;
  move: { x: number; y: number };
  look: { x: number; y: number };
  run: boolean;
  /** Buttons pressed since the last poll (edges). */
  pressed: { interact: boolean; jump: boolean; turn: number; reset: boolean; toggleView: boolean };
}

function axis(value: number | undefined): number {
  const v = value ?? 0;
  if (Math.abs(v) < DEADZONE) return 0;
  // Rescale past the dead zone so small pushes still start from zero.
  return Math.sign(v) * ((Math.abs(v) - DEADZONE) / (1 - DEADZONE));
}

export class GamepadReader {
  readonly state: GamepadState = {
    connected: false,
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    run: false,
    pressed: { interact: false, jump: false, turn: 0, reset: false, toggleView: false },
  };
  private readonly held: boolean[] = [];

  poll(): GamepadState {
    const state = this.state;
    const pressed = state.pressed;
    pressed.interact = false;
    pressed.jump = false;
    pressed.turn = 0;
    pressed.reset = false;
    pressed.toggleView = false;
    const pads =
      typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const candidate of pads) {
      if (candidate?.connected) {
        pad = candidate;
        break;
      }
    }
    state.connected = pad !== null;
    if (!pad) {
      state.move.x = 0;
      state.move.y = 0;
      state.look.x = 0;
      state.look.y = 0;
      state.run = false;
      this.held.length = 0;
      return state;
    }
    const down = (index: number) => pad.buttons[index]?.pressed ?? false;
    const edge = (index: number) => {
      const now = down(index);
      const was = this.held[index] ?? false;
      this.held[index] = now;
      return now && !was;
    };
    let mx = axis(pad.axes[0]);
    let my = -axis(pad.axes[1]);
    if (down(BUTTON.left)) mx -= 1;
    if (down(BUTTON.right)) mx += 1;
    if (down(BUTTON.up)) my += 1;
    if (down(BUTTON.down)) my -= 1;
    state.move.x = Math.max(-1, Math.min(1, mx));
    state.move.y = Math.max(-1, Math.min(1, my));
    state.look.x = axis(pad.axes[2]);
    state.look.y = axis(pad.axes[3]);
    state.run = down(BUTTON.rt) || down(BUTTON.l3);
    pressed.interact = edge(BUTTON.a);
    pressed.jump = edge(BUTTON.y);
    pressed.reset = edge(BUTTON.r3);
    pressed.toggleView = edge(BUTTON.back);
    if (edge(BUTTON.lb)) pressed.turn -= 1;
    if (edge(BUTTON.rb)) pressed.turn += 1;
    return state;
  }
}
