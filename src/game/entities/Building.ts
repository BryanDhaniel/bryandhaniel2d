import * as Phaser from "phaser";
import type { SectionId } from "@/content/portfolio";
import {
  BUILDING_SPECS,
  isArtBuilding,
  type ArtBuildingId,
  type ArtRect,
  type BuildingSpec,
  type PartSpec,
} from "@/game/art/buildings";
import { MAILBOX_SIZE } from "@/game/art/props";
import { KEYS } from "@/game/assets/manifest";
import { ANIMS } from "@/game/assets/textures";
import { ROOF, type LightKind } from "@/game/config/visuals";
import { DEPTH, INTERACTION } from "@/game/constants";
import type { LightManager } from "@/game/lighting/LightManager";
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

interface BuildingPart {
  sprite: Phaser.GameObjects.Sprite;
  spec: PartSpec;
}

export interface WorldPoint {
  x: number;
  y: number;
}

/**
 * A portfolio building, assembled from layers: the base (interior, walls, door, props) which
 * collides and is y-sorted with characters, the roof drawn just above it (faded while the
 * player is at the door or behind the building), an unlit night-lights layer and animated
 * parts. The mailbox is a single-sprite building.
 */
export class Building {
  readonly id: string;
  readonly sectionId: SectionId;
  readonly label: string;
  readonly base: Phaser.GameObjects.Image;
  readonly roof: Phaser.GameObjects.Image | null;
  readonly lights: Phaser.GameObjects.Image | null;
  readonly parts: BuildingPart[] = [];
  /** Shadow caster: frames to bake and where the art's bottom-left sits in the world. */
  readonly caster: {
    name: string;
    frames: string[];
    textureKey: string;
    width: number;
    height: number;
  };
  readonly artLeft: number;
  readonly bottom: number;
  readonly footprintWidth: number;
  readonly centerX: number;
  readonly approachTileX: number;
  readonly approachTileY: number;
  readonly doorX: number;
  readonly doorY: number;
  /** Where the prompt bubble's tail points (world pixels). */
  readonly promptX: number;
  readonly promptY: number;
  readonly lightAnchors: { x: number; y: number; kind: LightKind }[] = [];
  readonly smoke: WorldPoint[] = [];
  readonly sparks: WorldPoint | null;
  private readonly porch: Phaser.Geom.Rectangle;
  private readonly hitArea: Phaser.Geom.Rectangle;
  private readonly roofArea: Phaser.Geom.Rectangle | null;
  private roofAlpha = 1;

  constructor(
    scene: Phaser.Scene,
    solids: Phaser.Physics.Arcade.StaticGroup,
    config: BuildingConfig,
    lighting: LightManager,
    reducedMotion: boolean,
  ) {
    this.id = config.id;
    this.sectionId = config.sectionId;
    this.label = config.label;
    this.bottom = config.y + config.height;
    this.footprintWidth = config.width;
    this.centerX = config.x + config.width / 2;
    this.doorX = config.doorTileX * TILE_SIZE + TILE_SIZE / 2;
    this.doorY = this.bottom;
    this.approachTileX = config.doorTileX;
    this.approachTileY = config.doorTileY + 1;
    const depth = DEPTH.entity + this.bottom;

    if (config.id === "mailbox") {
      this.artLeft = Math.round(this.centerX - MAILBOX_SIZE.width / 2);
      this.base = scene.add
        .image(this.artLeft, this.bottom - 1, KEYS.props, "mailbox")
        .setOrigin(0, 1)
        .setDepth(depth);
      lighting.register(this.base, this.base.texture);
      this.roof = null;
      this.lights = null;
      this.roofArea = null;
      this.sparks = null;
      solids.add(scene.add.zone(this.centerX, this.bottom - 4, 10, 6));
      this.caster = {
        name: "prop/mailbox",
        frames: ["mailbox"],
        textureKey: KEYS.props,
        width: MAILBOX_SIZE.width,
        height: MAILBOX_SIZE.height,
      };
      const top = this.bottom - 1 - MAILBOX_SIZE.height;
      this.hitArea = new Phaser.Geom.Rectangle(
        this.artLeft,
        top,
        MAILBOX_SIZE.width,
        MAILBOX_SIZE.height,
      );
      this.promptX = this.doorX;
      this.promptY = top - 2;
    } else {
      const artId: ArtBuildingId = isArtBuilding(config.id) ? config.id : "home";
      if (artId !== config.id) {
        console.warn(`No building art named "${config.id}"; using "home".`);
      }
      const spec: BuildingSpec = BUILDING_SPECS[artId];
      const buildings = scene.textures.get(KEYS.buildings);
      // Centre the art on the footprint even if replacement art is a different width.
      this.artLeft = Math.round(this.centerX - spec.width / 2);
      const top = this.bottom - spec.height;
      const layer = (frame: string, layerDepth: number) =>
        scene.add
          .image(this.artLeft, this.bottom, KEYS.buildings, frame)
          .setOrigin(0, 1)
          .setDepth(layerDepth);

      this.base = layer(`${artId}/base`, depth);
      lighting.register(this.base, buildings);
      this.roof = layer(`${artId}/roof`, depth + 0.2);
      lighting.register(this.roof, buildings);
      this.lights = layer(`${artId}/lights`, depth + 0.3).setAlpha(0);

      const area = spec.roof;
      this.roofArea = new Phaser.Geom.Rectangle(
        this.artLeft + area.x,
        top + area.y,
        area.width,
        area.height,
      );
      this.hitArea = new Phaser.Geom.Rectangle(this.artLeft, top, spec.width, spec.height);
      this.promptX = this.doorX;
      this.promptY = top + spec.overhang - 4;

      for (const part of spec.parts) {
        const sprite = scene.add
          .sprite(this.artLeft + part.x, top + part.y, KEYS.buildings, `${part.name}/0`)
          .setOrigin(0, 0)
          .setDepth(part.onRoof ? depth + 0.21 : depth + 0.25);
        if (!reducedMotion || part.emissive) {
          sprite.play({ key: ANIMS.part(part.name), startFrame: 0 });
        }
        if (!part.emissive) {
          lighting.register(sprite, buildings);
        }
        this.parts.push({ sprite, spec: part });
      }

      for (const light of spec.lights) {
        this.lightAnchors.push({ x: this.artLeft + light.x, y: top + light.y, kind: light.kind });
      }
      for (const point of spec.smoke) {
        this.smoke.push({ x: this.artLeft + point.x, y: top + point.y });
      }
      this.sparks = spec.sparks
        ? { x: this.artLeft + spec.sparks.x, y: top + spec.sparks.y }
        : null;

      // Solid footprint, minus a sliver at the back so someone standing behind the house
      // overlaps the roof edge a little (reads as "behind") without disappearing under it.
      const inset = 2;
      solids.add(
        scene.add.zone(
          this.centerX,
          config.y + inset + (config.height - inset) / 2,
          config.width,
          config.height - inset,
        ),
      );
      for (const solid of spec.solids) {
        solids.add(this.zoneFor(scene, solid, top));
      }
      this.caster = {
        name: `building/${artId}`,
        frames: [`${artId}/base`, `${artId}/roof`],
        textureKey: KEYS.buildings,
        width: spec.width,
        height: spec.height,
      };
    }

    this.porch = new Phaser.Geom.Rectangle(
      this.doorX - INTERACTION.doorReach,
      this.bottom - 2,
      INTERACTION.doorReach * 2,
      INTERACTION.porchDepth,
    );
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

  /** Fades the roof while the player is at the door or hidden behind the building. */
  updateRoof(feetX: number, feetY: number, deltaMs: number): void {
    if (!this.roof || !this.roofArea) {
      return;
    }
    const area = this.roofArea;
    const behind =
      feetY < this.bottom - 2 &&
      feetX + 6 > area.x &&
      feetX - 6 < area.right &&
      feetY > area.y &&
      feetY - 16 < area.bottom;
    const target = behind || this.porch.contains(feetX, feetY) ? ROOF.fadedAlpha : 1;
    if (target === this.roofAlpha) {
      return;
    }
    const step = (ROOF.fadeSpeed * deltaMs) / 1000;
    this.roofAlpha =
      target > this.roofAlpha
        ? Math.min(target, this.roofAlpha + step)
        : Math.max(target, this.roofAlpha - step);
    this.roof.setAlpha(this.roofAlpha);
    for (const part of this.parts) {
      if (part.spec.onRoof) part.sprite.setAlpha(this.roofAlpha);
    }
  }

  /** Night lights (0-1). */
  setLightsLevel(level: number): void {
    if (this.lights && Math.abs(this.lights.alpha - level) > 0.004) {
      this.lights.setAlpha(level);
    }
  }

  private zoneFor(scene: Phaser.Scene, rect: ArtRect, top: number): Phaser.GameObjects.Zone {
    return scene.add.zone(
      this.artLeft + rect.x + rect.width / 2,
      top + rect.y + rect.height / 2,
      rect.width,
      rect.height,
    );
  }
}
