import * as Phaser from "phaser";
import { KEYS } from "@/game/assets/manifest";
import { DEPTH } from "@/game/constants";
import { int } from "@/game/palette";

const NIGHT_ALPHA = 0.78;
const GLOW_ALPHA = 0.45;
const FIREFLY_COUNT = 14;

interface Firefly {
  sprite: Phaser.GameObjects.Image;
  homeX: number;
  homeY: number;
  phase: number;
  speed: number;
}

/**
 * Optional night mode: a multiply tint over the world, lit windows and lamp halos above it,
 * and a small pool of fireflies. Everything is created once and only faded in and out.
 */
export class DayNightSystem {
  private readonly overlay: Phaser.GameObjects.Rectangle;
  private readonly fireflies: Firefly[] = [];
  private enabled = false;
  private level = 0;
  private tween: Phaser.Tweens.Tween | null = null;
  private readonly state = { level: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    worldWidth: number,
    worldHeight: number,
    private readonly lights: readonly Phaser.GameObjects.Image[],
    private readonly glows: readonly Phaser.GameObjects.Image[],
    fireflySpots: readonly { x: number; y: number }[],
    private readonly reducedMotion: boolean,
  ) {
    this.overlay = scene.add
      .rectangle(0, 0, worldWidth, worldHeight, int("slate"))
      .setOrigin(0, 0)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(DEPTH.night)
      .setAlpha(0)
      .setVisible(false);
    for (const glow of glows) {
      glow.setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights).setAlpha(0);
    }
    for (let i = 0; i < FIREFLY_COUNT && fireflySpots.length > 0; i += 1) {
      const spot = fireflySpots[i % fireflySpots.length] ?? { x: 0, y: 0 };
      const sprite = scene.add
        .image(spot.x, spot.y, KEYS.props, "firefly")
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.fireflies)
        .setVisible(false);
      this.fireflies.push({
        sprite,
        homeX: spot.x + (Math.random() * 2 - 1) * 24,
        homeY: spot.y + (Math.random() * 2 - 1) * 16,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.5,
      });
    }
  }

  get isNight(): boolean {
    return this.enabled;
  }

  set(enabled: boolean, instant = false): void {
    if (enabled === this.enabled && !instant) {
      return;
    }
    this.enabled = enabled;
    this.tween?.remove();
    this.tween = null;
    const target = enabled ? 1 : 0;
    if (instant || this.reducedMotion) {
      this.apply(target);
      return;
    }
    this.state.level = this.level;
    this.tween = this.scene.tweens.add({
      targets: this.state,
      level: target,
      duration: 900,
      ease: "Sine.easeInOut",
      onUpdate: () => this.apply(this.state.level),
    });
  }

  update(time: number): void {
    if (this.level <= 0) {
      return;
    }
    const t = time / 1000;
    for (const fly of this.fireflies) {
      const a = t * fly.speed + fly.phase;
      fly.sprite.setPosition(
        Math.round(fly.homeX + Math.cos(a) * 14 + Math.sin(a * 2.3) * 4),
        Math.round(fly.homeY + Math.sin(a * 1.3) * 8),
      );
      fly.sprite.setAlpha(this.level * (0.55 + 0.45 * Math.sin(a * 3.1)));
    }
  }

  destroy(): void {
    this.tween?.remove();
    this.overlay.destroy();
    for (const fly of this.fireflies) {
      fly.sprite.destroy();
    }
  }

  private apply(level: number): void {
    this.level = level;
    const visible = level > 0;
    this.overlay.setVisible(visible).setAlpha(level * NIGHT_ALPHA);
    for (const light of this.lights) {
      light.setAlpha(level);
    }
    for (const glow of this.glows) {
      glow.setAlpha(level * GLOW_ALPHA);
    }
    for (const fly of this.fireflies) {
      fly.sprite.setVisible(visible);
    }
  }
}
