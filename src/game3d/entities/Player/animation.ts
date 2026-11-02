import { CHARACTER } from "@/game3d/config/character";
import { FOOTFALL_FRAMES, FRAME_COUNTS, type Animation } from "./art";

/**
 * The player's animation state machine: idle (breathing), walk (faster while running) and
 * interact (a wave and nod). Walking always wins; a queued interaction plays once the player
 * stands still and is dropped if they walk off. Pure, so it is unit-tested.
 */
export class PlayerAnimator {
  animation: Animation = "idle";
  frame = 0;
  /** True for the update in which a foot lands (footstep sound, fringe bounce). */
  footfall = false;
  private time = 0;
  private plays = 0;
  private pending = false;

  /** Plays the wave as soon as the player is standing still. */
  queueInteract(): void {
    this.pending = true;
  }

  cancelInteract(): void {
    this.pending = false;
    if (this.animation === "interact") this.enter("idle");
  }

  update(deltaSeconds: number, moving: boolean, running: boolean): void {
    this.footfall = false;
    const timings = CHARACTER.timings;
    if (moving) {
      if (this.animation !== "walk") {
        this.enter("walk");
        this.footfall = FOOTFALL_FRAMES.includes(0);
        return;
      }
      const fps = timings.walkFps * (running ? timings.runMultiplier : 1);
      if (this.advance(deltaSeconds, 1 / fps)) {
        this.footfall = FOOTFALL_FRAMES.includes(this.frame);
      }
      return;
    }
    if (this.pending) {
      this.pending = false;
      this.enter("interact");
      return;
    }
    if (this.animation === "interact") {
      if (this.advance(deltaSeconds, timings.interactFrameSeconds) && this.frame === 0) {
        this.plays += 1;
        if (this.plays >= timings.interactLoops) this.enter("idle");
      }
      return;
    }
    if (this.animation !== "idle") {
      this.enter("idle");
      return;
    }
    this.advance(deltaSeconds, timings.idleFrameSeconds);
  }

  private enter(animation: Animation): void {
    this.animation = animation;
    this.frame = 0;
    this.time = 0;
    this.plays = 0;
  }

  /** Steps the frame clock; returns true when the frame changed. */
  private advance(deltaSeconds: number, frameSeconds: number): boolean {
    this.time += deltaSeconds;
    let changed = false;
    while (this.time >= frameSeconds) {
      this.time -= frameSeconds;
      this.frame = (this.frame + 1) % FRAME_COUNTS[this.animation];
      changed = true;
    }
    return changed;
  }
}
