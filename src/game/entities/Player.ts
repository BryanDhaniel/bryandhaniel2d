import * as Phaser from "phaser";
import type { Facing } from "@/game/art/characters";
import { characterFrameName } from "@/game/art/sprites";
import { KEYS } from "@/game/assets/manifest";
import { ANIMS } from "@/game/assets/textures";
import { DEPTH, PLAYER } from "@/game/constants";

/** Picks a facing from a movement vector, keeping the current one on near-diagonals. */
export function facingFor(dx: number, dy: number, current: Facing): Facing {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const horizontal: Facing = dx < 0 ? "left" : "right";
  const vertical: Facing = dy < 0 ? "up" : "down";
  if (ax > ay * 1.2) return horizontal;
  if (ay > ax * 1.2) return vertical;
  return current === horizontal || current === vertical
    ? current
    : ax >= ay
      ? horizontal
      : vertical;
}

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  facing: Facing = "down";
  private moving = false;
  private readonly shadow: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly onStep: (x: number, y: number) => void,
  ) {
    super(scene, x, y, KEYS.characters, characterFrameName("player", "down", 0));
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    this.body.setSize(PLAYER.body.width, PLAYER.body.height);
    this.body.setOffset(PLAYER.body.offsetX, PLAYER.body.offsetY);
    this.setCollideWorldBounds(true);
    this.shadow = scene.add
      .image(x, y, KEYS.props, "shadow")
      .setOrigin(0.5, 0.5)
      .setAlpha(0.3)
      .setDepth(DEPTH.shadow);
    this.play(ANIMS.idle("player", "down"));
    this.on(Phaser.Animations.Events.ANIMATION_UPDATE, this.handleFrame, this);
  }

  get isMoving(): boolean {
    return this.moving;
  }

  /** Feet are the sprite origin; the physics body is centred 3px above them. */
  get bodyCenterY(): number {
    return this.y - PLAYER.body.height / 2;
  }

  /**
   * Moves toward (dx, dy). Magnitudes above 1 are clamped; smaller values slow down
   * (used to arrive exactly on tap-to-move waypoints).
   */
  drive(dx: number, dy: number, speedScale: number): void {
    const length = Math.hypot(dx, dy);
    if (length < 0.01) {
      this.halt();
      return;
    }
    const speed = PLAYER.speed * speedScale * Math.min(1, length);
    this.setVelocity((dx / length) * speed, (dy / length) * speed);
    const facing = facingFor(dx, dy, this.facing);
    if (!this.moving || facing !== this.facing) {
      this.facing = facing;
      this.play(ANIMS.walk("player", facing), true);
    }
    this.anims.timeScale = speedScale;
    this.moving = true;
  }

  halt(): void {
    this.setVelocity(0, 0);
    if (this.moving) {
      this.moving = false;
      this.anims.timeScale = 1;
      this.play(ANIMS.idle("player", this.facing), true);
    }
  }

  face(facing: Facing): void {
    this.facing = facing;
    if (!this.moving) {
      this.play(ANIMS.idle("player", facing), true);
    }
  }

  syncDepth(): void {
    this.setDepth(DEPTH.entity + this.y);
    this.shadow.setPosition(this.x, this.y - 1);
  }

  override destroy(fromScene?: boolean): void {
    this.off(Phaser.Animations.Events.ANIMATION_UPDATE, this.handleFrame, this);
    this.shadow.destroy();
    super.destroy(fromScene);
  }

  private handleFrame(
    _animation: Phaser.Animations.Animation,
    frame: Phaser.Animations.AnimationFrame,
  ): void {
    // Feet hit the ground on the second and fourth walk frames.
    if (this.moving && (frame.index === 2 || frame.index === 4)) {
      this.onStep(this.x, this.y);
    }
  }
}
