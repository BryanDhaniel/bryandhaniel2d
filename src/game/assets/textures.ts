import type * as Phaser from "phaser";
import { packSprites, paintAtlas } from "@/game/art/atlas";
import { FACINGS, WALK_FRAMES, type CharacterId } from "@/game/art/characters";
import { FOUNTAIN_FRAMES } from "@/game/art/props";
import { ATLAS_SPRITES, characterFrameName } from "@/game/art/sprites";
import { TILESET_HEIGHT, TILESET_WIDTH, paintTileset } from "@/game/art/tiles";
import { KEYS, type AtlasGroup } from "./manifest";

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

/** Frame names a loaded atlas must contain to replace the generated one. */
export function missingFrames(scene: Phaser.Scene, group: AtlasGroup): string[] {
  const texture = scene.textures.get(KEYS[group]);
  return ATLAS_SPRITES[group]()
    .map((def) => def.name)
    .filter((name) => !texture.has(name));
}

export const ANIMS = {
  walk: (id: CharacterId, facing: string) => `${id}-walk-${facing}`,
  idle: (id: CharacterId, facing: string) => `${id}-idle-${facing}`,
  catWalk: "cat-walk",
  treeSway: "tree-sway",
  fountain: "fountain",
  dust: "dust",
  marker: "marker",
} as const;

const CHARACTERS: readonly CharacterId[] = ["player", "villager", "elder"];

function createOnce(scene: Phaser.Scene, config: Phaser.Types.Animations.Animation): void {
  if (config.key && !scene.anims.exists(config.key)) {
    scene.anims.create(config);
  }
}

export function createAnimations(scene: Phaser.Scene): void {
  for (const id of CHARACTERS) {
    for (const facing of FACINGS) {
      createOnce(scene, {
        key: ANIMS.walk(id, facing),
        frames: Array.from({ length: WALK_FRAMES }, (_, frame) => ({
          key: KEYS.characters,
          frame: characterFrameName(id, facing, frame),
        })),
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
    frames: [
      { key: KEYS.characters, frame: "cat/walk0" },
      { key: KEYS.characters, frame: "cat/walk1" },
    ],
    frameRate: 6,
    repeat: -1,
  });
  createOnce(scene, {
    key: ANIMS.treeSway,
    frames: [1, 0, 1, 2].map((frame) => ({ key: KEYS.props, frame: `tree/${frame}` })),
    frameRate: 1.6,
    repeat: -1,
  });
  createOnce(scene, {
    key: ANIMS.fountain,
    frames: Array.from({ length: FOUNTAIN_FRAMES }, (_, frame) => ({
      key: KEYS.props,
      frame: `fountain/${frame}`,
    })),
    frameRate: 6,
    repeat: -1,
  });
  createOnce(scene, {
    key: ANIMS.dust,
    frames: [0, 1, 2].map((frame) => ({ key: KEYS.props, frame: `dust/${frame}` })),
    frameRate: 14,
    repeat: 0,
  });
  createOnce(scene, {
    key: ANIMS.marker,
    frames: [0, 1].map((frame) => ({ key: KEYS.props, frame: `marker/${frame}` })),
    frameRate: 4,
    repeat: -1,
  });
}
