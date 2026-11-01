import * as Phaser from "phaser";
import { KEYS } from "@/game/assets/manifest";
import { WEATHER } from "@/game/config/visuals";
import { DEPTH } from "@/game/constants";

interface Firefly {
  sprite: Phaser.GameObjects.Image;
  homeX: number;
  homeY: number;
  phase: number;
  speed: number;
}

/** A fixed pool of glowing fireflies that drift around trees and lamps after dark. */
export class Fireflies {
  private readonly flies: Firefly[] = [];

  constructor(scene: Phaser.Scene, spots: readonly { x: number; y: number }[]) {
    for (let i = 0; i < WEATHER.fireflies.count && spots.length > 0; i += 1) {
      const spot = spots[i % spots.length] ?? { x: 0, y: 0 };
      this.flies.push({
        sprite: scene.add
          .image(spot.x, spot.y, KEYS.props, "firefly")
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(DEPTH.fireflies)
          .setVisible(false),
        homeX: spot.x + (Math.random() * 2 - 1) * 24,
        homeY: spot.y + (Math.random() * 2 - 1) * 16,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.5,
      });
    }
  }

  /** `level` is 0-1 (night amount times whether weather effects are enabled). */
  update(time: number, level: number): void {
    const visible = level > 0.01;
    const t = time / 1000;
    for (const fly of this.flies) {
      if (fly.sprite.visible !== visible) fly.sprite.setVisible(visible);
      if (!visible) continue;
      const a = t * fly.speed + fly.phase;
      fly.sprite.setPosition(
        Math.round(fly.homeX + Math.cos(a) * 14 + Math.sin(a * 2.3) * 4),
        Math.round(fly.homeY + Math.sin(a * 1.3) * 8),
      );
      fly.sprite.setAlpha(level * (0.55 + 0.45 * Math.sin(a * 3.1)));
    }
  }

  destroy(): void {
    for (const fly of this.flies) fly.sprite.destroy();
    this.flies.length = 0;
  }
}
