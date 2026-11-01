import type * as Phaser from "phaser";
import { FOG_SIZE, paintFog } from "@/game/art/props";
import { KEYS } from "@/game/assets/manifest";
import { WEATHER } from "@/game/config/visuals";
import { DEPTH } from "@/game/constants";
import { PIPELINES } from "@/game/shaders/pipelines";

/**
 * Drifting ground fog: a tiling dithered texture that covers the view, scrolls slowly with a
 * little parallax, and fades with the time of day and the rain. The texture is generated the
 * first time fog is needed.
 */
export class Fog {
  private sprite: Phaser.GameObjects.TileSprite | null = null;
  private drift = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  update(
    deltaMs: number,
    amount: number,
    scrollX: number,
    scrollY: number,
    width: number,
    height: number,
  ): void {
    if (amount <= 0.01) {
      this.sprite?.setVisible(false);
      return;
    }
    const sprite = this.ensureSprite(width, height);
    if (sprite.width !== width || sprite.height !== height) {
      sprite.setSize(width, height);
    }
    this.drift += (WEATHER.fog.drift * deltaMs) / 1000;
    sprite
      .setVisible(true)
      .setPosition(scrollX, scrollY)
      .setAlpha(Math.min(1, amount) * WEATHER.fog.alpha);
    sprite.tilePositionX = Math.round(scrollX * 0.6 + this.drift);
    sprite.tilePositionY = Math.round(scrollY * 0.6);
  }

  destroy(): void {
    this.sprite?.destroy();
    this.sprite = null;
  }

  private ensureSprite(width: number, height: number): Phaser.GameObjects.TileSprite {
    if (this.sprite) {
      return this.sprite;
    }
    const textures = this.scene.textures;
    if (!textures.exists(KEYS.fog)) {
      const texture = textures.createCanvas(KEYS.fog, FOG_SIZE.width, FOG_SIZE.height);
      if (texture) {
        paintFog(texture.getContext());
        texture.refresh();
      }
    }
    this.sprite = this.scene.add
      .tileSprite(0, 0, width, height, KEYS.fog)
      .setOrigin(0, 0)
      .setDepth(DEPTH.fog)
      .setPipeline(PIPELINES.unlit);
    return this.sprite;
  }
}
