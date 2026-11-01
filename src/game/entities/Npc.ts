import * as Phaser from "phaser";
import type { CharacterId, Facing } from "@/game/art/characters";
import { characterFrameName } from "@/game/art/sprites";
import { KEYS } from "@/game/assets/manifest";
import { ANIMS } from "@/game/assets/textures";
import { DEPTH } from "@/game/constants";
import type { NpcKind } from "@/game/map/village";
import { TILE_SIZE } from "@/game/map/village";
import { PathFollower, type Steer } from "@/game/systems/pathFollower";
import type { GridPathfinder } from "@/game/systems/pathfinding";
import { facingFor } from "./Player";

type NpcMode = "idle" | "walk" | "sit" | "sleep";

const WANDER_RADIUS = 5;
const NOTICE_DISTANCE = 26;

/**
 * Villagers and the cat wander around a home tile. They collide with the world but never
 * with the player, so they can't block a doorway or an interaction.
 */
export class Npc extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  private mode: NpcMode = "idle";
  private timer: number;
  private facing: Facing = "down";
  private readonly follower: PathFollower;
  private readonly steerOut: Steer = { x: 0, y: 0 };
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly emote: Phaser.GameObjects.Image;
  private emoteTimer = 0;
  private noticed = false;
  private stuckTime = 0;
  private walkAnimating = false;
  private lastX: number;
  private lastY: number;

  constructor(
    scene: Phaser.Scene,
    readonly kind: NpcKind,
    x: number,
    y: number,
    private readonly finder: GridPathfinder,
    private readonly homeTileX: number,
    private readonly homeTileY: number,
  ) {
    super(
      scene,
      x,
      y,
      KEYS.characters,
      kind === "cat"
        ? "cat/sit"
        : characterFrameName(kind === "elder" ? "elder" : "villager", "down", 0),
    );
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    if (kind === "cat") {
      this.body.setSize(10, 5).setOffset(3, 11);
    } else {
      this.body.setSize(10, 6).setOffset(3, 10);
    }
    this.setCollideWorldBounds(true);
    this.follower = new PathFollower(finder, 64);
    this.timer = 800 + Math.random() * 2200;
    this.lastX = x;
    this.lastY = y;
    this.shadow = scene.add
      .image(x, y, KEYS.props, "shadow")
      .setAlpha(0.25)
      .setDepth(DEPTH.shadow)
      .setScale(kind === "cat" ? 0.8 : 1, 1);
    this.emote = scene.add
      .image(x, y, KEYS.props, "heart")
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.emote)
      .setVisible(false);
    this.enterIdle();
  }

  private get characterId(): CharacterId {
    return this.kind === "elder" ? "elder" : "villager";
  }

  private get speed(): number {
    return this.kind === "cat" ? 26 : 30;
  }

  /** Called by the world scene each frame. */
  tick(delta: number, playerX: number, playerY: number): void {
    const near =
      Math.abs(playerX - this.x) < NOTICE_DISTANCE && Math.abs(playerY - this.y) < NOTICE_DISTANCE;
    if (near && !this.noticed) {
      this.noticed = true;
      this.react(playerX, playerY);
    } else if (!near) {
      this.noticed = false;
    }

    this.timer -= delta;
    switch (this.mode) {
      case "walk":
        this.walk(delta);
        break;
      case "idle":
      case "sit":
      case "sleep":
        if (this.timer <= 0 && !near) {
          this.chooseNext();
        }
        break;
    }

    if (this.emoteTimer > 0) {
      this.emoteTimer -= delta;
      if (this.emoteTimer <= 0 && this.mode !== "sleep") {
        this.emote.setVisible(false);
      }
    }
    this.setDepth(DEPTH.entity + this.y);
    this.shadow.setPosition(this.x, this.y - 1);
    if (this.emote.visible) {
      const bob = this.mode === "sleep" ? Math.sin(this.scene.time.now / 400) * 1.5 : 0;
      this.emote.setPosition(
        Math.round(this.x + (this.kind === "cat" ? 4 : 0)),
        Math.round(this.y - 17 + bob),
      );
    }
  }

  override destroy(fromScene?: boolean): void {
    this.shadow.destroy();
    this.emote.destroy();
    super.destroy(fromScene);
  }

  private react(playerX: number, playerY: number): void {
    if (this.kind === "cat") {
      if (this.mode === "sleep") {
        return;
      }
      this.stopMoving();
      this.mode = "sit";
      this.setFrame("cat/sit");
      this.setFlipX(playerX < this.x);
      this.showEmote("heart", 1600);
      this.timer = 2500;
      return;
    }
    // Villagers stop and turn to look at the visitor.
    this.stopMoving();
    this.mode = "idle";
    this.facing = facingFor(playerX - this.x, playerY - this.y, this.facing);
    this.play(ANIMS.idle(this.characterId, this.facing), true);
    this.timer = 2000;
  }

  private showEmote(frame: string, duration: number): void {
    this.emote.setFrame(frame).setVisible(true);
    this.emoteTimer = duration;
  }

  private chooseNext(): void {
    if (this.kind === "cat" && this.mode !== "sleep" && Math.random() < 0.25) {
      this.mode = "sleep";
      this.stopMoving();
      this.setFrame("cat/sleep");
      this.showEmote("zzz", Number.POSITIVE_INFINITY);
      this.timer = 6000 + Math.random() * 6000;
      return;
    }
    if (this.mode === "sleep") {
      this.emote.setVisible(false);
      this.emoteTimer = 0;
    }
    const fromX = Math.floor(this.x / TILE_SIZE);
    const fromY = Math.floor((this.y - 3) / TILE_SIZE);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const tx = this.homeTileX + Math.round((Math.random() * 2 - 1) * WANDER_RADIUS);
      const ty = this.homeTileY + Math.round((Math.random() * 2 - 1) * WANDER_RADIUS);
      if (this.finder.isWalkable(tx, ty) && this.follower.plan(fromX, fromY, tx, ty)) {
        this.mode = "walk";
        this.stuckTime = 0;
        if (this.kind === "cat") {
          this.play(ANIMS.catWalk, true);
        }
        return;
      }
    }
    this.enterIdle();
  }

  private walk(delta: number): void {
    if (!this.follower.steer(this.x, this.y - 3, this.steerOut)) {
      this.enterIdle();
      return;
    }
    const { x: dx, y: dy } = this.steerOut;
    const length = Math.hypot(dx, dy) || 1;
    const step = (this.speed * delta) / 1000;
    const factor = Math.min(1, length / Math.max(step, 0.001));
    this.setVelocity((dx / length) * this.speed * factor, (dy / length) * this.speed * factor);

    if (this.kind === "cat") {
      if (Math.abs(dx) > 0.5) {
        this.setFlipX(dx < 0);
      }
    } else {
      const facing = facingFor(dx, dy, this.facing);
      if (facing !== this.facing || !this.walkAnimating) {
        this.facing = facing;
        this.walkAnimating = true;
        this.play(ANIMS.walk(this.characterId, facing), true);
      }
    }

    // Give up on a route if something (the player's not solid, but a tree is) blocks it.
    const moved = Math.abs(this.x - this.lastX) + Math.abs(this.y - this.lastY);
    this.stuckTime = moved < 0.05 ? this.stuckTime + delta : 0;
    this.lastX = this.x;
    this.lastY = this.y;
    if (this.stuckTime > 600) {
      this.follower.cancel();
      this.enterIdle();
    }
  }

  private stopMoving(): void {
    this.walkAnimating = false;
    this.follower.cancel();
    this.setVelocity(0, 0);
  }

  private enterIdle(): void {
    this.stopMoving();
    this.mode = this.kind === "cat" ? "sit" : "idle";
    this.timer = 1500 + Math.random() * 3500;
    if (this.kind === "cat") {
      this.anims.stop();
      this.setFrame("cat/sit");
    } else {
      this.play(ANIMS.idle(this.characterId, this.facing), true);
    }
  }
}
