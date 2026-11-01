import * as Phaser from "phaser";
import type { SectionId } from "@/content/portfolio";
import { KEYS } from "@/game/assets/manifest";
import { ANIMS } from "@/game/assets/textures";
import type { MapMarker, PlayerPosition } from "@/game/bridge";
import { CAMERA, DEPTH, PLAYER, SCENES } from "@/game/constants";
import { Building } from "@/game/entities/Building";
import { Npc } from "@/game/entities/Npc";
import { Player } from "@/game/entities/Player";
import {
  buildNavigation,
  isTiledMap,
  objectLayer,
  objectProperty,
  objectType,
} from "@/game/map/navigation";
import { LAYER, OBJECT_TYPE, TILESET, gid, isWaterGid } from "@/game/map/tiled";
import { DEFAULT_AREA_NAME, TILE_SIZE, type NpcKind } from "@/game/map/village";
import { int } from "@/game/palette";
import { getServices, type Services } from "@/game/services";
import { DayNightSystem } from "@/game/systems/DayNightSystem";
import { InputSystem } from "@/game/systems/InputSystem";
import { InteractionSystem } from "@/game/systems/InteractionSystem";
import { PixelCamera } from "@/game/systems/PixelCamera";
import { GridPathfinder } from "@/game/systems/pathfinding";
import { computeViewport } from "@/game/systems/viewport";

const SECTION_IDS: ReadonlySet<string> = new Set<SectionId>([
  "about",
  "projects",
  "education",
  "skills",
  "contact",
]);
const NPC_KINDS: ReadonlySet<string> = new Set<NpcKind>(["cat", "villager", "elder"]);

function isSectionId(value: unknown): value is SectionId {
  return typeof value === "string" && SECTION_IDS.has(value);
}

function isNpcKind(value: string): value is NpcKind {
  return NPC_KINDS.has(value);
}

interface Area {
  name: string;
  rect: Phaser.Geom.Rectangle;
}

const WATER_FRAME_MS = 450;
const LOCATION_CHECK_MS = 200;
const POSITION_EMIT_MS = 100;

export class WorldScene extends Phaser.Scene {
  private services!: Services;
  private player!: Player;
  private controls!: InputSystem;
  private interaction!: InteractionSystem;
  private dayNight!: DayNightSystem;
  private finder!: GridPathfinder;
  private marker!: Phaser.GameObjects.Sprite;
  private dust!: Phaser.GameObjects.Group;
  private readonly buildings: Building[] = [];
  private readonly npcs: Npc[] = [];
  private readonly areas: Area[] = [];
  private readonly waterTiles: Phaser.Tilemaps.Tile[] = [];
  private waterMasks = new Uint8Array(0);
  private waterFrame = 0;
  private pendingBuilding: Building | null = null;
  private hasMoved = false;
  private locationName = "";
  private locationTimer = 0;
  private positionTimer = 0;
  private fpsTimer = 0;
  private fpsLowStreak = 0;
  private fpsReported = false;
  private elapsed = 0;
  private readonly position: PlayerPosition = { x: 0, y: 0 };
  private readonly pointerWorld = new Phaser.Math.Vector2();
  private readonly unsubscribe: (() => void)[] = [];

  constructor() {
    super(SCENES.world);
  }

  create(): void {
    this.services = getServices(this);
    try {
      this.build();
    } catch (error) {
      console.error(error);
      this.services.bridge.emit("fatal", {
        reason: "runtime",
        message: error instanceof Error ? error.message : "The village failed to start.",
      });
    }
  }

  private build(): void {
    const { bridge, options } = this.services;
    this.resetState();

    // ---- Map ----
    const cached: unknown = this.cache.tilemap.get(KEYS.map);
    const json = cached && typeof cached === "object" && "data" in cached ? cached.data : null;
    if (!isTiledMap(json)) {
      throw new Error("The village map data is missing or invalid.");
    }
    const map = this.make.tilemap({ key: KEYS.map });
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
    ground.setCollisionBetween(
      gid(TILESET.water),
      gid(TILESET.water + TILESET.waterFrames * 16 - 1),
    );
    obstacles.setCollisionByExclusion([-1]);

    const worldWidth = map.widthInPixels;
    const worldHeight = map.heightInPixels;
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);

    const navigation = buildNavigation(json);
    this.finder = new GridPathfinder(navigation.width, navigation.height, navigation.walkable);

    // ---- Objects ----
    const solids = this.physics.add.staticGroup();
    const glows: Phaser.GameObjects.Image[] = [];
    const fireflySpots: { x: number; y: number }[] = [];
    let spawnX = worldWidth / 2;
    let spawnY = worldHeight / 2;
    const npcSpawns: { kind: NpcKind; x: number; y: number }[] = [];

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
          this.buildings.push(
            new Building(this, solids, {
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
            }),
          );
          break;
        }
        case OBJECT_TYPE.fountain: {
          const fountain = this.add
            .sprite(object.x, object.y + object.height, KEYS.props, "fountain/0")
            .setOrigin(0, 1)
            .setDepth(DEPTH.entity + object.y + object.height);
          if (!options.reducedMotion) {
            fountain.play(ANIMS.fountain);
          }
          solids.add(
            this.add.zone(
              object.x + object.width / 2,
              object.y + object.height * 0.6,
              object.width - 2,
              object.height * 0.6,
            ),
          );
          break;
        }
        case OBJECT_TYPE.tree: {
          const x = object.x + TILE_SIZE / 2;
          const y = object.y + TILE_SIZE - 2;
          const tree = this.add
            .sprite(x, y, KEYS.props, "tree/1")
            .setOrigin(0.5, 1)
            .setDepth(DEPTH.entity + y);
          if (!options.reducedMotion) {
            tree.play({ key: ANIMS.treeSway, startFrame: Math.floor(Math.random() * 4) });
            tree.anims.timeScale = 0.8 + Math.random() * 0.4;
          }
          solids.add(this.add.zone(x, y - 3, 8, 6));
          fireflySpots.push({ x, y: y - 20 });
          break;
        }
        case OBJECT_TYPE.lamp: {
          const x = object.x + TILE_SIZE / 2;
          const y = object.y + TILE_SIZE - 1;
          this.add
            .image(x, y, KEYS.props, "lamp")
            .setOrigin(0.5, 1)
            .setDepth(DEPTH.entity + y);
          glows.push(this.add.image(x, y - 21, KEYS.props, "glow"));
          solids.add(this.add.zone(x, y - 2, 6, 4));
          fireflySpots.push({ x, y: y - 10 });
          break;
        }
        case OBJECT_TYPE.spawn: {
          if (object.name === "player") {
            spawnX = object.x;
            spawnY = object.y + 4;
          } else if (isNpcKind(object.name)) {
            npcSpawns.push({ kind: object.name, x: object.x, y: object.y + 4 });
          }
          break;
        }
        case OBJECT_TYPE.area:
          this.areas.push({
            name: object.name,
            rect: new Phaser.Geom.Rectangle(object.x, object.y, object.width, object.height),
          });
          break;
        default:
          break;
      }
    }

    // ---- Characters ----
    this.player = new Player(this, spawnX, spawnY, (x, y) => this.onStep(x, y));
    for (const spawn of npcSpawns) {
      this.npcs.push(
        new Npc(
          this,
          spawn.kind,
          spawn.x,
          spawn.y,
          this.finder,
          Math.floor(spawn.x / TILE_SIZE),
          Math.floor(spawn.y / TILE_SIZE),
        ),
      );
    }
    const blockers = [ground, obstacles, solids];
    for (const blocker of blockers) {
      this.physics.add.collider(this.player, blocker);
      this.physics.add.collider(this.npcs, blocker);
    }

    // ---- Pools and markers ----
    this.dust = this.add.group({ maxSize: 8 });
    this.marker = this.add
      .sprite(0, 0, KEYS.props, "marker/0")
      .setDepth(DEPTH.marker)
      .setVisible(false);

    // ---- Camera ----
    const camera = new PixelCamera(0, 0, this.scale.gameSize.width, this.scale.gameSize.height);
    this.cameras.remove(this.cameras.main, true);
    this.cameras.addExisting(camera, true);
    camera.setRoundPixels(false);
    camera.setBackgroundColor(int("forest"));
    camera.setBounds(0, 0, worldWidth, worldHeight);
    camera.startFollow(
      this.player,
      false,
      options.reducedMotion ? 0.3 : CAMERA.lerp,
      options.reducedMotion ? 0.3 : CAMERA.lerp,
    );
    camera.setFollowOffset(0, 8);
    camera.centerOn(this.player.x, this.player.y - 8);

    // ---- Systems ----
    this.controls = new InputSystem(this, this.finder);
    this.interaction = new InteractionSystem(this, this.buildings, bridge, options);
    this.dayNight = new DayNightSystem(
      this,
      worldWidth,
      worldHeight,
      this.buildings.flatMap((building) => (building.lights ? [building.lights] : [])),
      glows,
      fireflySpots,
      options.reducedMotion,
    );
    this.dayNight.set(options.night, true);
    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);

    // ---- Animated water ----
    ground.forEachTile((tile) => {
      if (isWaterGid(tile.index)) {
        this.waterTiles.push(tile);
      }
    });
    this.waterMasks = Uint8Array.from(
      this.waterTiles,
      (tile) => (tile.index - gid(TILESET.water)) % 16,
    );
    if (!options.reducedMotion && this.waterTiles.length > 0) {
      this.time.addEvent({
        delay: WATER_FRAME_MS,
        loop: true,
        callback: this.animateWater,
        callbackScope: this,
      });
    }

    // ---- Input from the canvas and the HTML UI ----
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointer, this);
    this.unsubscribe.push(
      bridge.on("pause", ({ paused }) => {
        this.controls.setPaused(paused);
        this.player.halt();
        this.pendingBuilding = null;
        this.marker.setVisible(false);
      }),
      bridge.on("night", ({ enabled }) => this.dayNight.set(enabled)),
      bridge.on("dpad", ({ x, y }) => {
        this.controls.setDpad(x, y);
        if (x !== 0 || y !== 0) {
          this.pendingBuilding = null;
          this.marker.setVisible(false);
        }
      }),
      bridge.on("interact", () => this.controls.queueInteract()),
      bridge.on("travel", ({ sectionId }) => {
        const building =
          this.buildings.find((entry) => entry.sectionId === sectionId && entry.id !== "mailbox") ??
          this.buildings.find((entry) => entry.sectionId === sectionId);
        if (building) {
          this.goToBuilding(building);
        }
      }),
      bridge.on("resetInput", () => this.controls.reset()),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.teardown, this);

    const markers: MapMarker[] = this.buildings
      .filter((building) => building.id !== "mailbox")
      .map((building) => ({
        buildingId: building.id,
        sectionId: building.sectionId,
        label: building.label,
        tileX: building.approachTileX,
        tileY: building.approachTileY - 1,
      }));
    bridge.emit("ready", {
      width: navigation.width,
      height: navigation.height,
      terrain: navigation.terrain,
      markers,
    });
    this.updateLocation();
  }

  override update(time: number, delta: number): void {
    if (!this.player || !this.controls) {
      return;
    }
    const { bridge } = this.services;
    this.elapsed += delta;

    this.controls.update(this.player.x, this.player.bodyCenterY, delta);
    const intent = this.controls.intent;
    this.player.drive(intent.x, intent.y, this.controls.run ? PLAYER.runMultiplier : 1);
    if (!this.hasMoved && this.player.isMoving) {
      this.hasMoved = true;
      bridge.emit("moved", null);
    }
    this.player.syncDepth();

    this.interaction.update(this.player.x, this.player.y);
    if (this.controls.consumeInteract()) {
      const nearest = this.interaction.nearest;
      if (nearest) {
        this.openBuilding(nearest);
      }
    }
    if (this.controls.arrived) {
      this.marker.setVisible(false);
      if (this.pendingBuilding && this.interaction.nearest === this.pendingBuilding) {
        this.openBuilding(this.pendingBuilding);
      }
      this.pendingBuilding = null;
    }

    for (const npc of this.npcs) {
      npc.tick(delta, this.player.x, this.player.y);
    }
    this.dayNight.update(time);

    this.locationTimer += delta;
    if (this.locationTimer >= LOCATION_CHECK_MS) {
      this.locationTimer = 0;
      this.updateLocation();
    }
    this.positionTimer += delta;
    if (this.positionTimer >= POSITION_EMIT_MS) {
      this.positionTimer = 0;
      this.position.x = this.player.x / TILE_SIZE;
      this.position.y = this.player.bodyCenterY / TILE_SIZE;
      bridge.emit("position", this.position);
    }
    this.watchFrameRate(delta);
  }

  private resetState(): void {
    this.buildings.length = 0;
    this.npcs.length = 0;
    this.areas.length = 0;
    this.waterTiles.length = 0;
    this.pendingBuilding = null;
    this.hasMoved = false;
    this.locationName = "";
    this.elapsed = 0;
    this.fpsReported = false;
    this.fpsLowStreak = 0;
  }

  private layout(): void {
    const camera = this.cameras.main;
    const { width, height } = this.scale.gameSize;
    const view = computeViewport(
      width,
      height,
      this.physics.world.bounds.width,
      this.physics.world.bounds.height,
    );
    camera.setViewport(view.x, view.y, view.width, view.height);
    camera.setZoom(view.zoom);
    this.interaction.setZoom(view.zoom);
  }

  private openBuilding(building: Building): void {
    this.controls.cancelPath();
    this.pendingBuilding = null;
    this.marker.setVisible(false);
    this.player.halt();
    this.player.face("up");
    this.interaction.open(building);
  }

  private goToBuilding(building: Building): void {
    if (this.controls.isPaused) {
      return;
    }
    if (this.interaction.nearest === building) {
      this.openBuilding(building);
      return;
    }
    const fromX = Math.floor(this.player.x / TILE_SIZE);
    const fromY = Math.floor(this.player.bodyCenterY / TILE_SIZE);
    if (this.controls.walkTo(fromX, fromY, building.approachTileX, building.approachTileY)) {
      this.pendingBuilding = building;
      this.showMarker(building.approachTileX, building.approachTileY);
    }
  }

  private handlePointer(pointer: Phaser.Input.Pointer): void {
    const camera = this.cameras.main;
    if (
      this.controls.isPaused ||
      pointer.x < camera.x ||
      pointer.y < camera.y ||
      pointer.x > camera.x + camera.width ||
      pointer.y > camera.y + camera.height
    ) {
      return;
    }
    camera.getWorldPoint(pointer.x, pointer.y, this.pointerWorld);
    const { x, y } = this.pointerWorld;
    for (const building of this.buildings) {
      if (building.hitTest(x, y)) {
        this.goToBuilding(building);
        return;
      }
    }
    const goal = this.finder.nearestWalkable(
      Math.floor(x / TILE_SIZE),
      Math.floor(y / TILE_SIZE),
      2,
    );
    if (goal < 0) {
      return;
    }
    const goalX = goal % this.finder.width;
    const goalY = Math.floor(goal / this.finder.width);
    this.pendingBuilding = null;
    if (
      this.controls.walkTo(
        Math.floor(this.player.x / TILE_SIZE),
        Math.floor(this.player.bodyCenterY / TILE_SIZE),
        goalX,
        goalY,
      )
    ) {
      this.showMarker(goalX, goalY);
    }
  }

  private showMarker(tileX: number, tileY: number): void {
    this.marker
      .setPosition(tileX * TILE_SIZE + TILE_SIZE / 2, tileY * TILE_SIZE + TILE_SIZE / 2 + 3)
      .setVisible(true);
    if (!this.services.options.reducedMotion) {
      this.marker.play(ANIMS.marker, true);
    }
  }

  private onStep(x: number, y: number): void {
    this.services.audio.play("step", 0.92 + Math.random() * 0.16);
    if (this.services.options.reducedMotion) {
      return;
    }
    const puff = this.dust.get(x, y - 1, KEYS.props, "dust/0") as Phaser.GameObjects.Sprite | null;
    if (!puff) {
      return;
    }
    if (!puff.getData("pooled")) {
      puff.setData("pooled", true);
      puff.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.dust.killAndHide(puff));
    }
    puff
      .setActive(true)
      .setVisible(true)
      .setDepth(DEPTH.shadow)
      .setPosition(x, y - 1);
    puff.play(ANIMS.dust);
  }

  private animateWater(): void {
    this.waterFrame = (this.waterFrame + 1) % TILESET.waterFrames;
    const base = gid(TILESET.water) + this.waterFrame * 16;
    for (let i = 0; i < this.waterTiles.length; i += 1) {
      const tile = this.waterTiles[i];
      if (tile) {
        tile.index = base + (this.waterMasks[i] ?? 0);
      }
    }
  }

  private updateLocation(): void {
    const x = this.player.x;
    const y = this.player.bodyCenterY;
    let name = DEFAULT_AREA_NAME;
    for (const area of this.areas) {
      if (area.rect.contains(x, y)) {
        name = area.name;
        break;
      }
    }
    if (name !== this.locationName) {
      this.locationName = name;
      this.services.bridge.emit("location", { name });
    }
  }

  private watchFrameRate(delta: number): void {
    if (this.fpsReported || this.elapsed < 5000) {
      return;
    }
    this.fpsTimer += delta;
    if (this.fpsTimer < 1000) {
      return;
    }
    this.fpsTimer = 0;
    // Ignore background-tab throttling; only count visible, focused slowness.
    if (document.visibilityState !== "visible") {
      this.fpsLowStreak = 0;
      return;
    }
    this.fpsLowStreak = this.game.loop.actualFps < 24 ? this.fpsLowStreak + 1 : 0;
    if (this.fpsLowStreak >= 4) {
      this.fpsReported = true;
      this.services.bridge.emit("lowFps", null);
    }
  }

  private teardown(): void {
    this.unsubscribe.forEach((off) => off());
    this.unsubscribe.length = 0;
    this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointer, this);
    this.interaction?.destroy();
    this.dayNight?.destroy();
  }
}
