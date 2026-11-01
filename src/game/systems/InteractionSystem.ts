import type * as Phaser from "phaser";
import type { EventPort, Events } from "@/game/bridge";
import { DEPTH } from "@/game/constants";
import type { Building } from "@/game/entities/Building";
import { hex, int } from "@/game/palette";

const FONT_SIZE = 7;
const PAD_X = 4;
const PAD_Y = 2;

/**
 * Tracks which building the player is standing at and shows a single, reused
 * "E / Tap" bubble above it with a gentle bob.
 */
export class InteractionSystem {
  private current: Building | null = null;
  private readonly prompt: Phaser.GameObjects.Container;
  private readonly bubble: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private bob: Phaser.Tweens.Tween | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly buildings: readonly Building[],
    private readonly bridge: EventPort<Events>,
    options: { touch: boolean; reducedMotion: boolean; fontFamily: string },
  ) {
    this.label = scene.add
      .text(0, 0, options.touch ? "Tap" : "E / Tap", {
        fontFamily: options.fontFamily,
        fontSize: `${FONT_SIZE}px`,
        color: hex("ink"),
      })
      .setOrigin(0.5, 1);
    this.bubble = scene.add.graphics();
    this.prompt = scene.add
      .container(0, 0, [this.bubble, this.label])
      .setDepth(DEPTH.prompt)
      .setVisible(false);
    this.drawBubble();
    if (!options.reducedMotion) {
      this.bob = scene.tweens.add({
        targets: [this.bubble, this.label],
        y: "-=1",
        duration: 480,
        ease: "Stepped",
        easeParams: [1],
        yoyo: true,
        repeat: -1,
        paused: true,
      });
    }
  }

  get nearest(): Building | null {
    return this.current;
  }

  /** Keeps canvas text crisp at the camera's integer zoom. */
  setZoom(zoom: number): void {
    this.label.setResolution(zoom);
    this.drawBubble();
  }

  update(feetX: number, feetY: number): void {
    let best: Building | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const building of this.buildings) {
      if (!building.isOnPorch(feetX, feetY)) {
        continue;
      }
      const distance = building.distanceToDoor(feetX, feetY);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = building;
      }
    }
    if (best === this.current) {
      return;
    }
    this.current = best;
    if (best) {
      this.prompt.setPosition(best.promptX, best.promptY).setVisible(true);
      this.bob?.resume();
      this.bridge.emit("near", { sectionId: best.sectionId, label: best.label });
    } else {
      this.prompt.setVisible(false);
      this.bob?.pause();
      this.bridge.emit("near", { sectionId: null, label: null });
    }
  }

  open(building: Building): void {
    this.bridge.emit("open", { sectionId: building.sectionId });
  }

  destroy(): void {
    this.bob?.remove();
    this.prompt.destroy();
  }

  private drawBubble(): void {
    const width = Math.ceil(this.label.width) + PAD_X * 2;
    const height = FONT_SIZE + PAD_Y * 2 + 1;
    const left = -Math.round(width / 2);
    const top = -height - 3;
    this.label.setPosition(0, -PAD_Y - 3);
    const g = this.bubble;
    g.clear();
    // Hard shadow, outline, fill, then the little tail pointing down at the door.
    g.fillStyle(int("ink"), 1);
    g.fillRect(left + 1, top + 1, width, height);
    g.fillRect(left - 1, top - 1, width + 2, height + 2);
    g.fillStyle(int("cloud"), 1);
    g.fillRect(left, top, width, height);
    g.fillStyle(int("gold"), 1);
    g.fillRect(left, top + height - 1, width, 1);
    g.fillStyle(int("ink"), 1);
    g.fillRect(-2, -3, 5, 1);
    g.fillRect(-1, -2, 3, 1);
    g.fillRect(0, -1, 1, 1);
  }
}
