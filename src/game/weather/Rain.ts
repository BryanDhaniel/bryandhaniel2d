import * as Phaser from "phaser";
import { KEYS } from "@/game/assets/manifest";
import { ANIMS } from "@/game/assets/textures";
import { WEATHER } from "@/game/config/visuals";
import { DEPTH } from "@/game/constants";
import { PIPELINES } from "@/game/shaders/pipelines";

/**
 * Light rain: slanted streaks across the view and little splashes where drops land. Both use
 * Phaser particle emitters, which pool their particles, so steady rain allocates nothing.
 * `level` eases in and out; `wetness` lags behind it and drives the puddle shine.
 */
export class Rain {
  level = 0;
  wetness = 0;
  private target = 0;
  private drops: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private splashes: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private readonly zone = new Phaser.Geom.Rectangle(0, 0, 1, 1);
  private splashTimer = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  setActive(active: boolean): void {
    this.target = active ? 1 : 0;
    if (active) {
      this.ensureEmitters();
    }
  }

  update(deltaMs: number, view: Phaser.Geom.Rectangle): void {
    const step = deltaMs / 1000 / WEATHER.rain.fade;
    this.level +=
      Math.sign(this.target - this.level) * Math.min(step, Math.abs(this.target - this.level));
    const wetRate = this.target > this.level || this.level > 0.5 ? 0.08 : -0.04;
    this.wetness = Math.min(1, Math.max(0, this.wetness + wetRate * (deltaMs / 1000)));
    if (!this.drops || !this.splashes) {
      return;
    }
    const active = this.level > 0.01;
    this.drops.setVisible(active);
    this.splashes.setVisible(active);
    if (!active) {
      if (this.drops.emitting) this.drops.stop();
      return;
    }
    // Spawn along a line above the view; drops fall in world space.
    this.zone.setTo(view.x - 40, view.y - 12, view.width + 80, 1);
    this.drops.frequency = 1000 / (WEATHER.rain.dropsPerSecond * this.level);
    if (!this.drops.emitting) this.drops.start();

    this.splashTimer -= deltaMs;
    const interval = 1000 / (WEATHER.rain.splashesPerSecond * this.level);
    while (this.splashTimer <= 0) {
      this.splashTimer += interval;
      const x = view.x + Math.random() * view.width;
      const y = view.y + Math.random() * view.height;
      this.splashes.emitParticleAt(Math.round(x), Math.round(y), 1);
    }
  }

  destroy(): void {
    this.drops?.destroy();
    this.splashes?.destroy();
    this.drops = null;
    this.splashes = null;
  }

  private ensureEmitters(): void {
    if (this.drops) {
      return;
    }
    const speed = WEATHER.rain.speed;
    this.drops = this.scene.add.particles(0, 0, KEYS.props, {
      frame: "rain",
      emitZone: { type: "random", source: this.zone, quantity: 1 },
      speedY: { min: speed * 0.85, max: speed * 1.1 },
      speedX: { min: speed * WEATHER.rain.slant * 0.8, max: speed * WEATHER.rain.slant },
      lifespan: { min: 500, max: 1300 },
      alpha: { start: 0.75, end: 0.45 },
      frequency: 20,
      quantity: 1,
      emitting: false,
    });
    this.drops.setDepth(DEPTH.weather).setPipeline(PIPELINES.unlit);
    this.splashes = this.scene.add.particles(0, 0, KEYS.props, {
      anim: ANIMS.splash,
      lifespan: 190,
      speed: 0,
      alpha: { start: 0.8, end: 0.3 },
      emitting: false,
    });
    this.splashes.setDepth(DEPTH.shadow + 1).setPipeline(PIPELINES.unlit);
  }
}
