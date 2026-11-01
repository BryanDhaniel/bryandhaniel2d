import type * as Phaser from "phaser";
import { CONTACT_DIRECTIONS } from "@/game/art/props";
import { KEYS } from "@/game/assets/manifest";
import { SHADOWS } from "@/game/config/visuals";
import { DEPTH } from "@/game/constants";
import type { CycleState } from "@/game/lighting/DayNightCycle";
import { aoFrameName, bakeShadows, type BakedFrame, type ShadowCaster } from "./bake";

export type ShadowMode = "blob" | "full";

const CONTACT_FRAMES = Array.from(
  { length: CONTACT_DIRECTIONS },
  (_, direction) => `contact/${direction}`,
);

interface CasterInstance {
  caster: string;
  x: number;
  bottom: number;
  sprite: Phaser.GameObjects.Image | null;
}

interface OcclusionInstance {
  width: number;
  centerX: number;
  bottom: number;
  sprite: Phaser.GameObjects.Image | null;
}

interface CharacterShadow {
  target: Phaser.GameObjects.Sprite;
  small: boolean;
  blob: Phaser.GameObjects.Image;
  contact: Phaser.GameObjects.Image;
  lastX: number;
  lastY: number;
}

/** Draws one atlas frame into a 2D canvas (for baking silhouettes from whatever art is loaded). */
export function frameDrawer(
  scene: Phaser.Scene,
  key: string,
  frameName: string,
  dx = 0,
  dy = 0,
): (ctx: CanvasRenderingContext2D) => void {
  return (ctx) => {
    const frame = scene.textures.getFrame(key, frameName);
    const image = frame?.source.image;
    if (frame && (image instanceof HTMLCanvasElement || image instanceof HTMLImageElement)) {
      ctx.drawImage(
        image,
        frame.cutX,
        frame.cutY,
        frame.cutWidth,
        frame.cutHeight,
        dx,
        dy,
        frame.cutWidth,
        frame.cutHeight,
      );
    }
  };
}

/**
 * Directional sun shadows (baked per sun step, skewed by the time of day and faded at night),
 * ambient occlusion at the base of buildings and trees, blob shadows under characters that
 * squash as they walk, and contact shadows thrown away from nearby lamps at night.
 */
export class ShadowSystem {
  private readonly casters = new Map<string, ShadowCaster>();
  private readonly instances: CasterInstance[] = [];
  private readonly occlusion: OcclusionInstance[] = [];
  private readonly treeOcclusion: Phaser.GameObjects.Image[] = [];
  private readonly characters: CharacterShadow[] = [];
  private lamps: readonly { x: number; y: number }[] = [];
  private frames: Map<string, BakedFrame> | null = null;
  private step = -1;
  private alpha = -1;
  private mode: ShadowMode = "full";

  constructor(private readonly scene: Phaser.Scene) {}

  defineCaster(caster: ShadowCaster): void {
    if (!this.casters.has(caster.name)) {
      this.casters.set(caster.name, caster);
    }
  }

  addCaster(name: string, x: number, bottom: number): void {
    this.instances.push({ caster: name, x, bottom, sprite: null });
  }

  addBuildingOcclusion(width: number, centerX: number, bottom: number): void {
    this.occlusion.push({ width, centerX, bottom, sprite: null });
  }

  addTreeOcclusion(x: number, bottom: number): void {
    this.treeOcclusion.push(
      this.scene.add
        .image(x, bottom - 3, KEYS.props, "ao/tree")
        .setDepth(DEPTH.shadow)
        .setAlpha(SHADOWS.aoAlpha),
    );
  }

  addCharacter(target: Phaser.GameObjects.Sprite, small = false): void {
    const blob = this.scene.add
      .image(target.x, target.y, KEYS.props, small ? "blob/0" : "blob/1")
      .setDepth(DEPTH.shadow + 0.5)
      .setAlpha(SHADOWS.blobAlpha);
    const contact = this.scene.add
      .image(target.x, target.y, KEYS.props, "contact/0")
      .setDepth(DEPTH.shadow + 0.4)
      .setVisible(false);
    this.characters.push({ target, small, blob, contact, lastX: target.x, lastY: target.y });
  }

  setLamps(lamps: readonly { x: number; y: number }[]): void {
    this.lamps = lamps;
  }

  /** Bakes the caster silhouettes into the shadow atlas and creates the shadow sprites. */
  bake(): void {
    const baked = bakeShadows(
      [...this.casters.values()],
      this.occlusion.map((entry) => entry.width),
    );
    const textures = this.scene.textures;
    if (textures.exists(KEYS.shadows)) {
      textures.remove(KEYS.shadows);
    }
    const texture = textures.addCanvas(KEYS.shadows, baked.canvas);
    if (!texture) {
      return;
    }
    for (const frame of baked.packed.frames) {
      texture.add(frame.name, 0, frame.x, frame.y, frame.width, frame.height);
    }
    this.frames = baked.frames;
    for (const instance of this.instances) {
      instance.sprite = this.scene.add
        .image(instance.x, instance.bottom, KEYS.shadows, `${instance.caster}/0`)
        .setDepth(DEPTH.shadow)
        .setAlpha(0);
    }
    for (const entry of this.occlusion) {
      entry.sprite = this.scene.add
        .image(entry.centerX, entry.bottom - 2, KEYS.shadows, aoFrameName(entry.width))
        .setOrigin(0.5, 0)
        .setDepth(DEPTH.shadow)
        .setAlpha(SHADOWS.aoAlpha);
    }
    this.step = -1;
    this.alpha = -1;
    this.applyMode();
  }

  setMode(mode: ShadowMode): void {
    this.mode = mode;
    this.applyMode();
  }

  /** Call every frame with the current cycle state. */
  update(cycle: CycleState): void {
    const full = this.mode === "full";
    if (full && this.frames && cycle.shadowStep !== this.step) {
      this.step = cycle.shadowStep;
      for (const instance of this.instances) {
        const name = `${instance.caster}/${this.step}`;
        const frame = this.frames.get(name);
        if (instance.sprite && frame) {
          instance.sprite
            .setFrame(name)
            .setOrigin(frame.anchorX / frame.width, frame.anchorY / frame.height);
        }
      }
    }
    const alpha = full ? cycle.shadowAlpha : 0;
    if (Math.abs(alpha - this.alpha) > 0.004) {
      this.alpha = alpha;
      for (const instance of this.instances) {
        instance.sprite?.setAlpha(alpha).setVisible(alpha > 0.004);
      }
    }
    this.updateCharacters(full ? cycle.lightsOn : 0);
  }

  destroy(): void {
    for (const instance of this.instances) instance.sprite?.destroy();
    for (const entry of this.occlusion) entry.sprite?.destroy();
    for (const image of this.treeOcclusion) image.destroy();
    for (const shadow of this.characters) {
      shadow.blob.destroy();
      shadow.contact.destroy();
    }
    this.instances.length = 0;
    this.occlusion.length = 0;
    this.treeOcclusion.length = 0;
    this.characters.length = 0;
    this.casters.clear();
  }

  private applyMode(): void {
    const full = this.mode === "full";
    for (const entry of this.occlusion) entry.sprite?.setVisible(full);
    for (const image of this.treeOcclusion) image.setVisible(full);
    if (!full) {
      for (const instance of this.instances) instance.sprite?.setVisible(false);
      this.alpha = -1;
    }
  }

  private updateCharacters(lightsOn: number): void {
    for (const shadow of this.characters) {
      const { target, blob, contact } = shadow;
      // Squash and stretch: the blob widens when a foot lands.
      let frame = shadow.small ? "blob/0" : "blob/1";
      const moving = Math.abs(target.x - shadow.lastX) + Math.abs(target.y - shadow.lastY) > 0.05;
      shadow.lastX = target.x;
      shadow.lastY = target.y;
      const current = target.anims.currentFrame;
      if (!shadow.small && moving && current) {
        frame = current.index % 2 === 0 ? "blob/2" : "blob/1";
      }
      if (blob.frame.name !== frame) blob.setFrame(frame);
      blob.setPosition(Math.round(target.x), Math.round(target.y - 1));
      blob.setVisible(target.visible);

      if (lightsOn <= 0.05) {
        if (contact.visible) contact.setVisible(false);
        continue;
      }
      let nearest = Number.POSITIVE_INFINITY;
      let lampX = 0;
      let lampY = 0;
      for (const lamp of this.lamps) {
        const dx = target.x - lamp.x;
        const dy = target.y - lamp.y;
        const distance = dx * dx + dy * dy;
        if (distance < nearest) {
          nearest = distance;
          lampX = lamp.x;
          lampY = lamp.y;
        }
      }
      const distance = Math.sqrt(nearest);
      if (distance > SHADOWS.contactRadius || distance < 1) {
        if (contact.visible) contact.setVisible(false);
        continue;
      }
      const angle = Math.atan2((target.y - lampY) / 0.6, target.x - lampX);
      const direction =
        ((Math.round(angle / ((Math.PI * 2) / CONTACT_DIRECTIONS)) % CONTACT_DIRECTIONS) +
          CONTACT_DIRECTIONS) %
        CONTACT_DIRECTIONS;
      const frameName = CONTACT_FRAMES[direction];
      if (frameName && contact.frame.name !== frameName) contact.setFrame(frameName);
      const ux = Math.cos(angle);
      const uy = Math.sin(angle) * 0.6;
      contact
        .setPosition(
          Math.round(target.x + ux * SHADOWS.contactOffset),
          Math.round(target.y - 1 + uy * SHADOWS.contactOffset),
        )
        .setAlpha(SHADOWS.contactAlpha * lightsOn * (1 - distance / SHADOWS.contactRadius))
        .setVisible(target.visible);
    }
  }
}
