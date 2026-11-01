import * as Phaser from "phaser";
import type { SectionId } from "@/content/portfolio";
import { BUILDING_ART } from "@/game/art/buildings";
import { KEYS } from "@/game/assets/manifest";
import { DEPTH, INTERACTION } from "@/game/constants";
import { TILE_SIZE } from "@/game/map/village";

export interface BuildingConfig {
  id: string;
  sectionId: SectionId;
  label: string;
  /** Footprint in world pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  doorTileX: number;
  doorTileY: number;
}

/**
 * A portfolio building: its sprite, a solid footprint, the porch where the "E / Tap" prompt
 * appears, and an optional night-lights overlay.
 */
export class Building {
  readonly id: string;
  readonly sectionId: SectionId;
  readonly label: string;
  readonly sprite: Phaser.GameObjects.Image;
  readonly lights: Phaser.GameObjects.Image | null;
  /** Tile just outside the door, used as the walk-to target. */
  readonly approachTileX: number;
  readonly approachTileY: number;
  readonly doorX: number;
  readonly doorY: number;
  /** Where the prompt bubble sits (bottom-centre of the bubble). */
  readonly promptX: number;
  readonly promptY: number;
  private readonly porch: Phaser.Geom.Rectangle;
  private readonly hitArea: Phaser.Geom.Rectangle;

  constructor(
    scene: Phaser.Scene,
    obstacles: Phaser.Physics.Arcade.StaticGroup,
    config: BuildingConfig,
  ) {
    this.id = config.id;
    this.sectionId = config.sectionId;
    this.label = config.label;
    const isMailbox = config.id === "mailbox";
    const bottom = config.y + config.height;
    const centerX = config.x + config.width / 2;

    if (isMailbox) {
      this.sprite = scene.add.image(centerX, bottom - 1, KEYS.props, "mailbox").setOrigin(0.5, 1);
      this.lights = null;
      obstacles.add(scene.add.zone(centerX, bottom - 4, 10, 6));
    } else {
      const frame = scene.textures.get(KEYS.buildings).has(config.id) ? config.id : "home";
      if (frame !== config.id) {
        console.warn(`No building art named "${config.id}"; using "home".`);
      }
      this.sprite = scene.add.image(config.x, bottom, KEYS.buildings, frame).setOrigin(0, 1);
      // Keep the art pixel-aligned with the footprint even if a replacement is a different size.
      this.sprite.setX(Math.round(centerX - this.sprite.width / 2));
      const lightsFrame = `${frame}-lights`;
      this.lights = scene.textures.get(KEYS.buildings).has(lightsFrame)
        ? scene.add
            .image(this.sprite.x, bottom, KEYS.buildings, lightsFrame)
            .setOrigin(0, 1)
            .setDepth(DEPTH.lights)
            .setAlpha(0)
        : null;
      // Solid footprint, minus a sliver at the back so a character standing behind the house
      // overlaps the roof edge a little (reads as "behind") without disappearing under it.
      const inset = 2;
      obstacles.add(
        scene.add.zone(
          centerX,
          config.y + inset + (config.height - inset) / 2,
          config.width,
          config.height - inset,
        ),
      );
    }
    this.sprite.setDepth(DEPTH.entity + bottom);

    this.doorX = config.doorTileX * TILE_SIZE + TILE_SIZE / 2;
    this.doorY = bottom;
    this.approachTileX = config.doorTileX;
    this.approachTileY = config.doorTileY + 1;
    this.porch = new Phaser.Geom.Rectangle(
      this.doorX - INTERACTION.doorReach,
      bottom - 2,
      INTERACTION.doorReach * 2,
      INTERACTION.porchDepth,
    );
    const art =
      !isMailbox && config.id in BUILDING_ART
        ? BUILDING_ART[config.id as keyof typeof BUILDING_ART]
        : null;
    const top = bottom - this.sprite.height;
    this.hitArea = new Phaser.Geom.Rectangle(
      this.sprite.x,
      top,
      this.sprite.width,
      this.sprite.height,
    );
    this.promptX = this.doorX;
    this.promptY = isMailbox ? top - 2 : top + (art ? art.overhang : 0) - 4;
  }

  /** Is a character's feet position on the porch? */
  isOnPorch(x: number, y: number): boolean {
    return this.porch.contains(x, y);
  }

  /** Squared distance from a point to the door, for picking the nearest building. */
  distanceToDoor(x: number, y: number): number {
    const dx = x - this.doorX;
    const dy = y - this.doorY;
    return dx * dx + dy * dy;
  }

  hitTest(x: number, y: number): boolean {
    return this.hitArea.contains(x, y);
  }
}
