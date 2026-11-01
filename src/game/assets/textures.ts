import type * as Phaser from "phaser";
import { packSprites, paintAtlas } from "@/game/art/atlas";
import { BUILDING_SPECS, PART_SIZES } from "@/game/art/buildings";
import { FACINGS, WALK_FRAMES, type CharacterId } from "@/game/art/characters";
import { TREE_STRIP, TUFT_STRIP, paintStrip, stripLayout, type StripSpec } from "@/game/art/nature";
import { FOUNTAIN_FRAMES } from "@/game/art/props";
import { ATLAS_SPRITES, characterFrameName } from "@/game/art/sprites";
import { TILESET_HEIGHT, TILESET_WIDTH, paintTileset } from "@/game/art/tiles";
import { NORMAL_PRESETS, normalMapCanvas } from "@/game/lighting/normalMaps";
import { KEYS, type AtlasGroup, type StripGroup, type TextureGroup } from "./manifest";

/** Paints a generated atlas group into a canvas texture and registers its frames. */
export function generateAtlas(scene: Phaser.Scene, group: AtlasGroup): void {
  const key = KEYS[group];
  if (scene.textures.exists(key)) {
    scene.textures.remove(key);
  }
  const defs = ATLAS_SPRITES[group]();
  const packed = packSprites(defs);
  const texture = scene.textures.createCanvas(key, packed.width, packed.height);
  if (!texture) {
    throw new Error(`Could not create the "${key}" texture.`);
  }
  paintAtlas(texture.getContext(), defs, packed);
  texture.refresh();
  for (const frame of packed.frames) {
    texture.add(frame.name, 0, frame.x, frame.y, frame.width, frame.height);
  }
}

const STRIPS: Record<StripGroup, StripSpec> = {
  trees: TREE_STRIP,
  tufts: TUFT_STRIP,
};

/** Paints a single-row strip texture (trees, tufts) and registers its frames. */
export function generateStrip(scene: Phaser.Scene, group: StripGroup): void {
  const key = KEYS[group];
  if (scene.textures.exists(key)) {
    scene.textures.remove(key);
  }
  const spec = STRIPS[group];
  const layout = stripLayout(spec);
  const texture = scene.textures.createCanvas(key, layout.width, layout.height);
  if (!texture) {
    throw new Error(`Could not create the "${key}" texture.`);
  }
  paintStrip(texture.getContext(), spec, layout);
  texture.refresh();
  for (const frame of layout.frames) {
    texture.add(frame.name, 0, frame.x, 0, frame.width, layout.height);
  }
}

export function generateTileset(scene: Phaser.Scene): void {
  if (scene.textures.exists(KEYS.tiles)) {
    scene.textures.remove(KEYS.tiles);
  }
  const texture = scene.textures.createCanvas(KEYS.tiles, TILESET_WIDTH, TILESET_HEIGHT);
  if (!texture) {
    throw new Error("Could not create the tileset texture.");
  }
  paintTileset(texture.getContext());
  texture.refresh();
}

/** Frame names a loaded texture must contain to replace the generated one. */
export function requiredFrames(group: AtlasGroup | StripGroup): string[] {
  if (group === "trees" || group === "tufts") {
    return STRIPS[group].frames.map((frame) => frame.name);
  }
  return ATLAS_SPRITES[group]().map((def) => def.name);
}

export function missingFrames(scene: Phaser.Scene, group: AtlasGroup | StripGroup): string[] {
  const texture = scene.textures.get(KEYS[group]);
  return requiredFrames(group).filter((name) => !texture.has(name));
}

/** Attaches a normal map image to a texture, replacing any previous one. */
export function attachNormalMap(
  texture: Phaser.Textures.Texture,
  normal: HTMLCanvasElement | HTMLImageElement,
): void {
  for (const source of texture.dataSource) {
    source.destroy();
  }
  texture.dataSource.length = 0;
  texture.setDataSource(normal);
}

/** Generates and attaches a normal map for one of the generated textures. */
export function generateNormalMap(scene: Phaser.Scene, group: TextureGroup): boolean {
  const texture = scene.textures.get(KEYS[group]);
  const image = texture.getSourceImage();
  if (!(image instanceof HTMLCanvasElement || image instanceof HTMLImageElement)) {
    return false;
  }
  const preset = group === "tiles" ? NORMAL_PRESETS.tiles : NORMAL_PRESETS.sprites;
  attachNormalMap(texture, normalMapCanvas(image, image.width, image.height, preset));
  return true;
}

export const ANIMS = {
  walk: (id: CharacterId, facing: string) => `${id}-walk-${facing}`,
  idle: (id: CharacterId, facing: string) => `${id}-idle-${facing}`,
  catWalk: "cat-walk",
  fountain: "fountain",
  dust: "dust",
  marker: "marker",
  smoke: "smoke",
  splash: "splash",
  part: (name: string) => `${name}-loop`,
} as const;

const CHARACTERS: readonly CharacterId[] = ["player", "villager", "elder"];

function createOnce(scene: Phaser.Scene, config: Phaser.Types.Animations.Animation): void {
  if (config.key && !scene.anims.exists(config.key)) {
    scene.anims.create(config);
  }
}

function frames(key: string, names: readonly string[]): Phaser.Types.Animations.AnimationFrame[] {
  return names.map((frame) => ({ key, frame }));
}

export function createAnimations(scene: Phaser.Scene): void {
  for (const id of CHARACTERS) {
    for (const facing of FACINGS) {
      createOnce(scene, {
        key: ANIMS.walk(id, facing),
        frames: frames(
          KEYS.characters,
          Array.from({ length: WALK_FRAMES }, (_, frame) => characterFrameName(id, facing, frame)),
        ),
        frameRate: 8,
        repeat: -1,
      });
      createOnce(scene, {
        key: ANIMS.idle(id, facing),
        frames: [
          { key: KEYS.characters, frame: characterFrameName(id, facing, 0), duration: 2600 },
          { key: KEYS.characters, frame: characterFrameName(id, facing, "blink"), duration: 140 },
        ],
        repeat: -1,
      });
    }
  }
  createOnce(scene, {
    key: ANIMS.catWalk,
    frames: frames(KEYS.characters, ["cat/walk0", "cat/walk1"]),
    frameRate: 6,
    repeat: -1,
  });
  createOnce(scene, {
    key: ANIMS.fountain,
    frames: frames(
      KEYS.props,
      Array.from({ length: FOUNTAIN_FRAMES }, (_, frame) => `fountain/${frame}`),
    ),
    frameRate: 6,
    repeat: -1,
  });
  createOnce(scene, {
    key: ANIMS.dust,
    frames: frames(KEYS.props, ["dust/0", "dust/1", "dust/2"]),
    frameRate: 14,
    repeat: 0,
  });
  createOnce(scene, {
    key: ANIMS.marker,
    frames: frames(KEYS.props, ["marker/0", "marker/1"]),
    frameRate: 4,
    repeat: -1,
  });
  createOnce(scene, {
    key: ANIMS.smoke,
    frames: frames(KEYS.props, ["smoke/0", "smoke/1", "smoke/2"]),
    frameRate: 1.3,
    repeat: 0,
  });
  createOnce(scene, {
    key: ANIMS.splash,
    frames: frames(KEYS.props, ["splash/0", "splash/1", "splash/2"]),
    frameRate: 16,
    repeat: 0,
  });
  // Building parts: gears, the dish, screens, LEDs, the beacon and the inn sign.
  const seen = new Set<string>();
  for (const spec of Object.values(BUILDING_SPECS)) {
    for (const part of spec.parts) {
      if (seen.has(part.name)) continue;
      seen.add(part.name);
      const size = PART_SIZES[part.name];
      if (!size) continue;
      createOnce(scene, {
        key: ANIMS.part(part.name),
        frames: frames(
          KEYS.buildings,
          Array.from({ length: size.frames }, (_, frame) => `${part.name}/${frame}`),
        ),
        frameRate: part.frameRate,
        repeat: -1,
        yoyo: part.yoyo,
      });
    }
  }
}
