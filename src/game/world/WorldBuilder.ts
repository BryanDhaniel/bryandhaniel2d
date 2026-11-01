import * as Phaser from "phaser";
import type { SectionId } from "@/content/portfolio";
import { TREE_HEIGHT, TREE_WIDTHS, TUFT_STRIP } from "@/game/art/nature";
import { hash2 } from "@/game/art/pixels";
import { BENCH_SIZE, FOUNTAIN_SIZE, LAMP_SIZE, STALL_SIZE, WELL_SIZE } from "@/game/art/props";
import { KEYS } from "@/game/assets/manifest";
import { ANIMS } from "@/game/assets/textures";
import { WIND } from "@/game/config/visuals";
import { DEPTH } from "@/game/constants";
import { Building } from "@/game/entities/Building";
import type { LightHandle, LightManager } from "@/game/lighting/LightManager";
import {
  buildNavigation,
  objectLayer,
  objectProperty,
  objectType,
  type Navigation,
} from "@/game/map/navigation";
import {
  FIRST_GID,
  LAYER,
  OBJECT_TYPE,
  TILESET,
  gid,
  type TiledMap,
  type TiledObject,
} from "@/game/map/tiled";
import { TILE_SIZE, type NpcKind, type TreeVariant } from "@/game/map/village";
import { frameDrawer, type ShadowSystem } from "@/game/shadows/ShadowSystem";

const SECTION_IDS: ReadonlySet<string> = new Set<SectionId>([
  "about",
  "projects",
  "education",
  "skills",
  "contact",
]);
const NPC_KINDS: ReadonlySet<string> = new Set<NpcKind>(["cat", "villager", "elder"]);
const TREE_VARIANTS: ReadonlySet<string> = new Set<TreeVariant>(["oak", "pine", "birch"]);

function isSectionId(value: unknown): value is SectionId {
  return typeof value === "string" && SECTION_IDS.has(value);
}

function isNpcKind(value: string): value is NpcKind {
  return NPC_KINDS.has(value);
}

function isTreeVariant(value: unknown): value is TreeVariant {
  return typeof value === "string" && TREE_VARIANTS.has(value);
}

/** A grey tint whose level is the sprite's wind phase (read by the wind vertex shader). */
function windPhaseTint(x: number, y: number): number {
  const level = Math.floor(hash2(Math.round(x), Math.round(y), 51) * 255);
  return (level << 16) | (level << 8) | level;
}

export interface Area {
  name: string;
  rect: Phaser.Geom.Rectangle;
}

export interface SparkSource {
  emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  light: LightHandle | null;
  timer: number;
}

export interface WorldParts {
  json: TiledMap;
  ground: Phaser.Tilemaps.TilemapLayer;
  obstacles: Phaser.Tilemaps.TilemapLayer;
  navigation: Navigation;
  worldWidth: number;
  worldHeight: number;
  solids: Phaser.Physics.Arcade.StaticGroup;
  buildings: Building[];
  /** Lamp glow sprites, used as cheap fake lights when lighting is off. */
  glows: Phaser.GameObjects.Image[];
  lampPoints: { x: number; y: number }[];
  fireflySpots: { x: number; y: number }[];
  smoke: Phaser.GameObjects.Particles.ParticleEmitter[];
  sparks: SparkSource[];
  areas: Area[];
  spawn: { x: number; y: number };
  npcSpawns: { kind: NpcKind; x: number; y: number }[];
}

interface BuildContext {
  scene: Phaser.Scene;
  lighting: LightManager;
  shadows: ShadowSystem;
  reducedMotion: boolean;
}

/** Defines a caster for a single frame (once per frame name) and places an instance. */
function castShadow(
  ctx: BuildContext,
  name: string,
  key: string,
  frame: string,
  width: number,
  height: number,
  left: number,
  bottom: number,
): void {
  ctx.shadows.defineCaster({ name, width, height, draw: frameDrawer(ctx.scene, key, frame) });
  ctx.shadows.addCaster(name, left, bottom);
}

function addProp(
  ctx: BuildContext,
  solids: Phaser.Physics.Arcade.StaticGroup,
  object: TiledObject,
  frame: string,
  size: { width: number; height: number },
  solid: { width: number; height: number },
): Phaser.GameObjects.Image {
  const left = object.x + Math.round((object.width - size.width) / 2);
  const bottom = object.y + object.height;
  const image = ctx.scene.add
    .image(left, bottom, KEYS.props, frame)
    .setOrigin(0, 1)
    .setDepth(DEPTH.entity + bottom);
  ctx.lighting.register(image, image.texture);
  castShadow(ctx, `prop/${frame}`, KEYS.props, frame, size.width, size.height, left, bottom);
  solids.add(
    ctx.scene.add.zone(
      object.x + object.width / 2,
      bottom - solid.height / 2 - 1,
      solid.width,
      solid.height,
    ),
  );
  return image;
}

export function buildWorld(
  scene: Phaser.Scene,
  json: TiledMap,
  lighting: LightManager,
  shadows: ShadowSystem,
  reducedMotion: boolean,
): WorldParts {
  const ctx: BuildContext = { scene, lighting, shadows, reducedMotion };

  // ---- Tile layers ----
  const map = scene.make.tilemap({ key: KEYS.map });
  const tileset = map.addTilesetImage(
    map.tilesets[0]?.name ?? TILESET.name,
    KEYS.tiles,
    TILE_SIZE,
    TILE_SIZE,
    0,
    0,
  );
  if (!tileset) {
    throw new Error("The village tileset could not be attached.");
  }
  const ground = map.createLayer(LAYER.ground, tileset, 0, 0);
  const obstacles = map.createLayer(LAYER.obstacles, tileset, 0, 0);
  if (!ground || !obstacles) {
    throw new Error('The map needs "ground" and "obstacles" tile layers.');
  }
  ground.setDepth(DEPTH.ground);
  obstacles.setDepth(DEPTH.obstacles);
  ground.setCollisionBetween(gid(TILESET.water), gid(TILESET.water + TILESET.waterFrames * 16 - 1));
  obstacles.setCollisionByExclusion([-1]);
  const tilesTexture = scene.textures.get(KEYS.tiles);
  lighting.register(ground, tilesTexture);
  lighting.register(obstacles, tilesTexture);

  const worldWidth = map.widthInPixels;
  const worldHeight = map.heightInPixels;
  const navigation = buildNavigation(json);

  const parts: WorldParts = {
    json,
    ground,
    obstacles,
    navigation,
    worldWidth,
    worldHeight,
    solids: scene.physics.add.staticGroup(),
    buildings: [],
    glows: [],
    lampPoints: [],
    fireflySpots: [],
    smoke: [],
    sparks: [],
    areas: [],
    spawn: { x: worldWidth / 2, y: worldHeight / 2 },
    npcSpawns: [],
  };
  const { solids } = parts;

  // ---- Objects ----
  let stallCount = 0;
  for (const object of objectLayer(json)?.objects ?? []) {
    const type = objectType(object);
    switch (type) {
      case OBJECT_TYPE.building: {
        const section = objectProperty(object, "section");
        if (!isSectionId(section)) {
          console.warn(`Building "${object.name}" has no valid "section" property; skipping it.`);
          break;
        }
        const doorX = objectProperty(object, "doorX");
        const doorY = objectProperty(object, "doorY");
        const label = objectProperty(object, "label");
        const building = new Building(
          scene,
          solids,
          {
            id: object.name,
            sectionId: section,
            label: typeof label === "string" ? label : object.name,
            x: object.x,
            y: object.y,
            width: object.width,
            height: object.height,
            doorTileX:
              typeof doorX === "number"
                ? doorX
                : Math.floor((object.x + object.width / 2) / TILE_SIZE),
            doorTileY:
              typeof doorY === "number"
                ? doorY
                : Math.floor((object.y + object.height) / TILE_SIZE) - 1,
          },
          lighting,
          reducedMotion,
        );
        parts.buildings.push(building);
        const caster = building.caster;
        shadows.defineCaster({
          name: caster.name,
          width: caster.width,
          height: caster.height,
          draw: (canvas) => {
            for (const frame of caster.frames) frameDrawer(scene, caster.textureKey, frame)(canvas);
          },
        });
        shadows.addCaster(caster.name, building.artLeft, building.bottom);
        if (building.roof) {
          shadows.addBuildingOcclusion(
            building.footprintWidth + 6,
            building.centerX,
            building.bottom,
          );
        }
        let forgeLight: LightHandle | null = null;
        for (const anchor of building.lightAnchors) {
          // In a top-down view a light's pool belongs on the ground: windows, lanterns and
          // screens on the facade light the street in front of the building.
          const onFacade = anchor.kind !== "forge" && anchor.kind !== "beacon";
          const y = onFacade ? Math.max(anchor.y, building.bottom + 4) : anchor.y;
          const handle = lighting.addLight(anchor.kind, anchor.x, y);
          if (anchor.kind === "forge") forgeLight = handle;
        }
        if (!reducedMotion) {
          for (const point of building.smoke) {
            const emitter = scene.add.particles(point.x, point.y, KEYS.props, {
              anim: ANIMS.smoke,
              lifespan: 2300,
              speedY: { min: -11, max: -7 },
              speedX: { min: -2, max: 3 },
              accelerationX: 3,
              frequency: 650,
              quantity: 1,
              alpha: { start: 0.75, end: 0 },
            });
            emitter.setDepth(DEPTH.entity + building.bottom + 0.4);
            lighting.register(emitter, scene.textures.get(KEYS.props));
            parts.smoke.push(emitter);
          }
          if (building.sparks) {
            const emitter = scene.add.particles(building.sparks.x, building.sparks.y, KEYS.props, {
              frame: ["spark/0", "spark/1"],
              lifespan: { min: 280, max: 620 },
              speed: { min: 22, max: 58 },
              angle: { min: 215, max: 325 },
              gravityY: 150,
              emitting: false,
              blendMode: Phaser.BlendModes.ADD,
            });
            emitter.setDepth(DEPTH.entity + building.bottom + 0.4);
            parts.sparks.push({ emitter, light: forgeLight, timer: 800 });
          }
        }
        break;
      }
      case OBJECT_TYPE.fountain: {
        const left = object.x + Math.round((object.width - FOUNTAIN_SIZE.width) / 2);
        const bottom = object.y + object.height;
        const fountain = scene.add
          .sprite(left, bottom, KEYS.props, "fountain/0")
          .setOrigin(0, 1)
          .setDepth(DEPTH.entity + bottom);
        if (!reducedMotion) fountain.play(ANIMS.fountain);
        lighting.register(fountain, fountain.texture);
        castShadow(
          ctx,
          "prop/fountain",
          KEYS.props,
          "fountain/0",
          FOUNTAIN_SIZE.width,
          FOUNTAIN_SIZE.height,
          left,
          bottom,
        );
        solids.add(
          scene.add.zone(
            object.x + object.width / 2,
            object.y + object.height * 0.6,
            object.width - 2,
            object.height * 0.6,
          ),
        );
        break;
      }
      case OBJECT_TYPE.tree: {
        const variantProperty = objectProperty(object, "variant");
        const variant: TreeVariant = isTreeVariant(variantProperty)
          ? variantProperty
          : isTreeVariant(object.name)
            ? object.name
            : "oak";
        const x = object.x + TILE_SIZE / 2;
        const bottom = object.y + TILE_SIZE - 1;
        const tree = scene.add
          .image(x, bottom, KEYS.trees, variant)
          .setOrigin(0.5, 1)
          .setDepth(DEPTH.entity + bottom)
          .setTint(windPhaseTint(x, bottom));
        lighting.register(tree, tree.texture, true);
        const width = TREE_WIDTHS[variant];
        castShadow(
          ctx,
          `tree/${variant}`,
          KEYS.trees,
          variant,
          width,
          TREE_HEIGHT,
          x - width / 2,
          bottom,
        );
        shadows.addTreeOcclusion(x, bottom);
        solids.add(scene.add.zone(x, bottom - 3, 8, 6));
        parts.fireflySpots.push({ x, y: bottom - 20 });
        break;
      }
      case OBJECT_TYPE.lamp: {
        const x = object.x + TILE_SIZE / 2;
        const bottom = object.y + TILE_SIZE - 1;
        const lamp = scene.add
          .image(x, bottom, KEYS.props, "lamp")
          .setOrigin(0.5, 1)
          .setDepth(DEPTH.entity + bottom);
        lighting.register(lamp, lamp.texture);
        castShadow(
          ctx,
          "prop/lamp",
          KEYS.props,
          "lamp",
          LAMP_SIZE.width,
          LAMP_SIZE.height,
          x - LAMP_SIZE.width / 2,
          bottom,
        );
        // The pool of light sits around the post's foot, not the lantern head.
        lighting.addLight("lamp", x, bottom - 3);
        parts.lampPoints.push({ x, y: bottom - 2 });
        parts.glows.push(
          scene.add
            .image(x, bottom - 21, KEYS.props, "glow")
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(DEPTH.fireflies - 1)
            .setAlpha(0),
        );
        solids.add(scene.add.zone(x, bottom - 2, 6, 4));
        parts.fireflySpots.push({ x, y: bottom - 10 });
        break;
      }
      case OBJECT_TYPE.stall: {
        stallCount += 1;
        addProp(
          ctx,
          solids,
          object,
          stallCount % 2 === 1 ? "stall/fruit" : "stall/cloth",
          STALL_SIZE,
          {
            width: object.width - 2,
            height: 10,
          },
        );
        break;
      }
      case OBJECT_TYPE.bench:
        addProp(ctx, solids, object, "bench", BENCH_SIZE, { width: 14, height: 6 });
        break;
      case OBJECT_TYPE.well:
        addProp(ctx, solids, object, "well", WELL_SIZE, { width: 16, height: 10 });
        break;
      case OBJECT_TYPE.spawn: {
        if (object.name === "player") {
          parts.spawn = { x: object.x, y: object.y + 4 };
        } else if (isNpcKind(object.name)) {
          parts.npcSpawns.push({ kind: object.name, x: object.x, y: object.y + 4 });
        }
        break;
      }
      case OBJECT_TYPE.area:
        parts.areas.push({
          name: object.name,
          rect: new Phaser.Geom.Rectangle(object.x, object.y, object.width, object.height),
        });
        break;
      default:
        break;
    }
  }

  // ---- Grass tufts that sway in the wind ----
  const groundData = ground.layer.data;
  const tuftFrames = TUFT_STRIP.frames.length;
  for (let ty = 0; ty < map.height; ty += 1) {
    for (let tx = 0; tx < map.width; tx += 1) {
      const index = groundData[ty]?.[tx]?.index ?? 0;
      const local = index - FIRST_GID;
      const grassy = local >= TILESET.grass && local < TILESET.flowers + TILESET.flowerVariants;
      if (!grassy || navigation.walkable[ty * map.width + tx] !== 1) continue;
      if (hash2(tx, ty, 57) > WIND.tuftDensity) continue;
      const x = tx * TILE_SIZE + 3 + Math.floor(hash2(tx, ty, 58) * 10);
      const y = ty * TILE_SIZE + 6 + Math.floor(hash2(tx, ty, 59) * 9);
      const frame = `tuft/${Math.floor(hash2(tx, ty, 60) * tuftFrames)}`;
      const tuft = scene.add
        .image(x, y, KEYS.tufts, frame)
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.entity + y - 4)
        .setTint(windPhaseTint(x, y));
      lighting.register(tuft, tuft.texture, true);
    }
  }

  return parts;
}
