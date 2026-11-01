import * as Phaser from "phaser";
import { KEYS, TEXTURE_GROUPS, normalMapUrl, type TextureGroup } from "@/game/assets/manifest";
import { ANIMS, attachNormalMap, generateNormalMap } from "@/game/assets/textures";
import type { MapMarker, PlayerPosition } from "@/game/bridge";
import { POST, QUALITY, RENDER, WATER } from "@/game/config/visuals";
import { DEPTH, PLAYER, SCENES } from "@/game/constants";
import type { Building } from "@/game/entities/Building";
import { Npc } from "@/game/entities/Npc";
import { Player } from "@/game/entities/Player";
import { DayNightCycle } from "@/game/lighting/DayNightCycle";
import { LightManager, type LightHandle } from "@/game/lighting/LightManager";
import { isTiledMap } from "@/game/map/navigation";
import { TILESET, gid, isWaterGid, type TiledMap } from "@/game/map/tiled";
import { DEFAULT_AREA_NAME, TILE_SIZE } from "@/game/map/village";
import { PALETTE, int } from "@/game/palette";
import { getServices, type Services } from "@/game/services";
import { QUALITY_FEATURES, QualityManager } from "@/game/settings/QualityManager";
import type { DayPhase, QualityLevel } from "@/game/settings/types";
import { ShadowSystem } from "@/game/shadows/ShadowSystem";
import { WorldUniforms, attachWorldUniforms } from "@/game/shaders/pipelines";
import {
  POST_FX,
  PostSettings,
  RetroPostFX,
  RetroSettings,
  VillagePostFX,
} from "@/game/shaders/postfx";
import { InputSystem } from "@/game/systems/InputSystem";
import { InteractionSystem } from "@/game/systems/InteractionSystem";
import { SmoothCamera } from "@/game/systems/SmoothCamera";
import { GridPathfinder } from "@/game/systems/pathfinding";
import { waterMaskCanvas } from "@/game/systems/waterMask";
import { WeatherSystem } from "@/game/weather/WeatherSystem";
import { buildWorld, type WorldParts } from "@/game/world/WorldBuilder";
import { GENERATED_GROUPS_KEY } from "./PreloadScene";

const LOCATION_CHECK_MS = 200;
const POSITION_EMIT_MS = 100;
const GLOW_ALPHA = 0.45;

function floats(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

const SKY = floats(PALETTE.sky);
const FOAM = floats(PALETTE.foam);

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

export class WorldScene extends Phaser.Scene {
  private services!: Services;
  private parts!: WorldParts;
  private player!: Player;
  private controls!: InputSystem;
  private interaction!: InteractionSystem;
  private camera!: SmoothCamera;
  private cycle!: DayNightCycle;
  private lighting!: LightManager;
  private shadows!: ShadowSystem;
  private weather!: WeatherSystem;
  private quality!: QualityManager;
  private finder!: GridPathfinder;
  private marker!: Phaser.GameObjects.Sprite;
  private dust!: Phaser.GameObjects.Group;
  private playerLight!: LightHandle;
  private uniforms = new WorldUniforms();
  private readonly postSettings = new PostSettings();
  private readonly retroSettings = new RetroSettings();
  private readonly npcs: Npc[] = [];
  private readonly waterTiles: Phaser.Tilemaps.Tile[] = [];
  private waterMasks = new Uint8Array(0);
  private waterFrame = 0;
  private waterTexture: WebGLTexture | null = null;
  private retroEnabled = false;
  private level: QualityLevel = "high";
  private pendingBuilding: Building | null = null;
  private hasMoved = false;
  private alive = false;
  private locationName = "";
  private phase: DayPhase | null = null;
  private locationTimer = 0;
  private positionTimer = 0;
  private fpsTimer = 0;
  private fpsLowStreak = 0;
  private fpsReported = false;
  private elapsed = 0;
  private readonly ambient = new Float32Array(3);
  private readonly view = new Phaser.Geom.Rectangle();
  private readonly position: PlayerPosition = { x: 0, y: 0 };
  private readonly canvasPoint = { x: 0, y: 0 };
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
    const { bridge, options, viewport } = this.services;
    this.resetState();
    this.alive = true;

    const cached: unknown = this.cache.tilemap.get(KEYS.map);
    const json = cached && typeof cached === "object" && "data" in cached ? cached.data : null;
    if (!isTiledMap(json)) {
      throw new Error("The village map data is missing or invalid.");
    }

    // ---- Lighting, shadows and the world itself ----
    this.uniforms = new WorldUniforms();
    if (options.reducedMotion) {
      this.uniforms.windAmplitude = 0;
    }
    attachWorldUniforms(this.game, this.uniforms);
    this.lighting = new LightManager(this.uniforms);
    this.shadows = new ShadowSystem(this);
    this.parts = buildWorld(this, json, this.lighting, this.shadows, options.reducedMotion);
    const { worldWidth, worldHeight, navigation, solids } = this.parts;
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);
    this.finder = new GridPathfinder(navigation.width, navigation.height, navigation.walkable);
    this.shadows.setLamps(this.parts.lampPoints);

    // ---- Characters ----
    const { spawn } = this.parts;
    this.player = new Player(this, spawn.x, spawn.y, (x, y) => this.onStep(x, y));
    this.lighting.register(this.player, this.player.texture);
    this.shadows.addCharacter(this.player);
    this.playerLight = this.lighting.addLight("player", spawn.x, spawn.y - 2, true);
    for (const npcSpawn of this.parts.npcSpawns) {
      const npc = new Npc(
        this,
        npcSpawn.kind,
        npcSpawn.x,
        npcSpawn.y,
        this.finder,
        Math.floor(npcSpawn.x / TILE_SIZE),
        Math.floor(npcSpawn.y / TILE_SIZE),
      );
      this.lighting.register(npc, npc.texture);
      this.shadows.addCharacter(npc, npcSpawn.kind === "cat");
      this.npcs.push(npc);
    }
    for (const blocker of [this.parts.ground, this.parts.obstacles, solids]) {
      this.physics.add.collider(this.player, blocker);
      this.physics.add.collider(this.npcs, blocker);
    }

    // ---- Pools and markers ----
    this.dust = this.add.group({ maxSize: 8 });
    this.marker = this.add
      .sprite(0, 0, KEYS.props, "marker/0")
      .setDepth(DEPTH.marker)
      .setVisible(false);

    // ---- Camera: whole-texel scroll plus a sub-texel canvas offset ----
    const camera = this.cameras.main;
    camera.setRoundPixels(true);
    camera.setBackgroundColor(int("forest"));
    this.camera = new SmoothCamera(
      camera,
      viewport.layout,
      worldWidth,
      worldHeight,
      viewport.setOffset,
    );
    this.camera.snapTo(this.player.x, this.player.y - RENDER.cameraFocusOffsetY);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);

    // ---- Systems ----
    this.controls = new InputSystem(this, this.finder);
    this.interaction = new InteractionSystem(this.parts.buildings, bridge);
    this.cycle = new DayNightCycle(options.timeMode, options.reducedMotion);
    this.weather = new WeatherSystem(
      this,
      options.weather,
      this.parts.fireflySpots,
      options.reducedMotion,
    );
    this.retroEnabled = options.retro;
    this.quality = new QualityManager(options.quality, (level, setting) => {
      this.applyQuality(level);
      bridge.emit("qualityLevel", { level, setting });
    });
    this.applyQuality(this.quality.level);
    bridge.emit("qualityLevel", {
      level: this.quality.level,
      setting: this.quality.currentSetting,
    });

    // ---- Animated water tiles ----
    this.parts.ground.forEachTile((tile) => {
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
        delay: WATER.frameMs,
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
      bridge.on("setTimeMode", ({ mode }) => this.cycle.setMode(mode)),
      bridge.on("setWeather", ({ kind }) => this.weather.setKind(kind)),
      bridge.on("setQuality", ({ setting }) => this.quality.setSetting(setting)),
      bridge.on("setRetro", ({ enabled }) => {
        this.retroEnabled = enabled;
        this.applyPostPipelines();
      }),
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
          this.parts.buildings.find(
            (entry) => entry.sectionId === sectionId && entry.id !== "mailbox",
          ) ?? this.parts.buildings.find((entry) => entry.sectionId === sectionId);
        if (building) {
          this.goToBuilding(building);
        }
      }),
      bridge.on("resetInput", () => this.controls.reset()),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.teardown, this);

    const markers: MapMarker[] = this.parts.buildings
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

    // Normal maps, shadow baking and the water mask wait until the first frame is on screen.
    this.events.once(Phaser.Scenes.Events.POST_UPDATE, () => {
      void this.runDeferredWork(json).catch((error: unknown) => console.error(error));
    });
  }

  override update(time: number, delta: number): void {
    if (!this.alive || !this.player || !this.controls) {
      return;
    }
    const { bridge, viewport } = this.services;
    this.elapsed += delta;

    // ---- Movement ----
    this.controls.update(this.player.x, this.player.bodyCenterY, delta);
    const intent = this.controls.intent;
    this.player.drive(intent.x, intent.y, this.controls.run ? PLAYER.runMultiplier : 1);
    if (!this.hasMoved && this.player.isMoving) {
      this.hasMoved = true;
      bridge.emit("moved", null);
    }
    this.player.syncDepth();
    this.lighting.move(this.playerLight, this.player.x, this.player.y - 2);

    // ---- Camera ----
    const lerp = this.services.options.reducedMotion
      ? RENDER.cameraLerpReducedMotion
      : RENDER.cameraLerp;
    this.camera.update(this.player.x, this.player.y - RENDER.cameraFocusOffsetY, delta, lerp);
    const layout = viewport.layout;
    const camera = this.cameras.main;
    this.view.setTo(camera.scrollX, camera.scrollY, layout.canvasWidth, layout.canvasHeight);

    // ---- Time of day, lights and shadows ----
    this.cycle.update(delta);
    const state = this.cycle.state;
    const weatherScale = this.weather.ambientScale;
    this.ambient[0] = (state.ambient[0] ?? 1) * weatherScale;
    this.ambient[1] = (state.ambient[1] ?? 1) * weatherScale;
    this.ambient[2] = (state.ambient[2] ?? 1) * weatherScale;
    this.lighting.update(
      time,
      this.view,
      camera.scrollX,
      camera.scrollY,
      state.lightsOn,
      this.ambient,
    );
    this.uniforms.time = this.services.options.reducedMotion ? 0 : (time / 1000) % 3600;
    this.shadows.update(state);
    for (const building of this.parts.buildings) {
      building.updateRoof(this.player.x, this.player.y, delta);
      building.setLightsLevel(state.lightsOn);
    }
    if (!this.lighting.enabled) {
      const glow = state.lightsOn * GLOW_ALPHA;
      for (const image of this.parts.glows) {
        if (Math.abs(image.alpha - glow) > 0.004) image.setAlpha(glow);
      }
    }
    if (state.phase !== this.phase) {
      this.phase = state.phase;
      bridge.emit("clock", { phase: state.phase });
    }

    // ---- Interaction ----
    this.interaction.update(this.player.x, this.player.y, this.camera);
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

    // ---- Life ----
    for (const npc of this.npcs) {
      npc.tick(delta, this.player.x, this.player.y);
    }
    this.weather.update(
      time,
      delta,
      state,
      this.view,
      layout.canvasWidth,
      layout.canvasHeight,
      camera.scrollX,
      camera.scrollY,
    );
    for (const source of this.parts.sparks) {
      source.timer -= delta;
      if (source.timer <= 0) {
        source.timer = 1200 + Math.random() * 1600;
        source.emitter.explode(5 + Math.floor(Math.random() * 4));
        if (source.light) this.lighting.pulse(source.light, 0.9);
      }
    }

    // ---- Post-processing inputs ----
    const post = this.postSettings;
    post.time = this.uniforms.time;
    post.scrollX = camera.scrollX;
    post.scrollY = camera.scrollY;
    post.daylight = state.daylight;
    post.bloomStrength = POST.bloomStrength * state.bloom;
    post.vignette = POST.vignetteStrength * state.vignette;
    post.gradeStrength = state.gradeStrength;
    post.saturation = state.saturation;
    post.contrast = state.contrast;
    post.brightness = state.brightness;
    post.gradeTint[0] = state.gradeTint[0] ?? 1;
    post.gradeTint[1] = state.gradeTint[1] ?? 1;
    post.gradeTint[2] = state.gradeTint[2] ?? 1;
    // Reflections pick up the sky colour by day and the ambient light by night.
    for (let c = 0; c < 3; c += 1) {
      post.skyTint[c] = (SKY[c] ?? 1) * 0.35 + (this.ambient[c] ?? 1) * 0.75;
      post.sparkColor[c] = FOAM[c] ?? 1;
    }
    post.puddles = QUALITY_FEATURES[this.level].reflections
      ? this.weather.wetness * WATER.puddleShine * 2.5
      : 0;
    this.retroSettings.time = post.time;

    // ---- HUD feeds ----
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
    // Frame-rate checks use the raw frame time: Phaser's smoothed delta spreads a single
    // stall (tab switch, dialog) across the following frames and would read as slowness.
    const rawDelta = this.game.loop.rawDelta;
    if (document.visibilityState === "visible") {
      this.quality.sample(rawDelta);
    }
    this.watchFrameRate(rawDelta);
  }

  private resetState(): void {
    this.npcs.length = 0;
    this.waterTiles.length = 0;
    this.pendingBuilding = null;
    this.hasMoved = false;
    this.locationName = "";
    this.phase = null;
    this.elapsed = 0;
    this.fpsReported = false;
    this.fpsLowStreak = 0;
    this.waterTexture = null;
  }

  /** Switches every visual system to the features of a quality level. */
  private applyQuality(level: QualityLevel): void {
    this.level = level;
    const features = QUALITY_FEATURES[level];
    this.lighting.setLightingEnabled(features.lighting);
    this.shadows.setMode(features.shadows);
    this.weather.setEnabled(features.weather);
    this.postSettings.water = features.water;
    this.postSettings.reflections = features.reflections ? WATER.reflectionStrength : 0;
    for (const glow of this.parts.glows) {
      glow.setVisible(!features.lighting);
    }
    this.applyPostPipelines();
  }

  /**
   * Keeps the camera's post chain in sync: village effects, then the optional retro filter.
   * The chain is only rebuilt when it changes (rebuilding recompiles its shaders).
   */
  private applyPostPipelines(): void {
    const camera = this.cameras.main;
    const features = QUALITY_FEATURES[this.level];
    const wanted: string[] = [];
    if (features.postFx) {
      wanted.push(POST_FX.village);
      if (this.retroEnabled) wanted.push(POST_FX.retro);
    }
    const current = camera.postPipelines.map((pipeline) => pipeline.name);
    if (current.length !== wanted.length || current.some((name, i) => name !== wanted[i])) {
      camera.resetPostPipeline();
      for (const name of wanted) {
        camera.setPostPipeline(name);
      }
    }
    for (const pipeline of camera.postPipelines) {
      if (pipeline instanceof VillagePostFX) {
        pipeline.settings = this.postSettings;
        pipeline.mask = this.waterTexture
          ? {
              texture: this.waterTexture,
              width: this.parts.worldWidth,
              height: this.parts.worldHeight,
            }
          : null;
      } else if (pipeline instanceof RetroPostFX) {
        pipeline.settings = this.retroSettings;
      }
    }
  }

  /**
   * Work that would otherwise delay the first frame: bake sun shadows, build the water mask
   * and generate (or fetch) normal maps, then switch lit objects over to their normal maps.
   */
  private async runDeferredWork(json: TiledMap): Promise<void> {
    await yieldToBrowser();
    if (!this.alive) return;
    this.shadows.bake();
    this.shadows.update(this.cycle.state);

    await yieldToBrowser();
    if (!this.alive) return;
    const maskTexture = this.textures.addCanvas(KEYS.waterMask, waterMaskCanvas(json));
    this.waterTexture = maskTexture?.source[0]?.glTexture?.webGLTexture ?? null;
    this.applyPostPipelines();

    const generated =
      (this.registry.get(GENERATED_GROUPS_KEY) as Set<TextureGroup> | undefined) ?? new Set();
    const toLoad: { group: TextureGroup; url: string }[] = [];
    for (const group of TEXTURE_GROUPS) {
      await yieldToBrowser();
      if (!this.alive) return;
      if (generated.has(group)) {
        generateNormalMap(this, group);
      } else {
        const url = normalMapUrl(group);
        if (url) toLoad.push({ group, url });
      }
    }
    this.lighting.refreshPipelines();
    if (toLoad.length > 0) {
      this.loadNormalMaps(toLoad);
    }
  }

  /** Fetches hand-made normal maps for swapped-in art. Missing files leave the art unlit. */
  private loadNormalMaps(entries: readonly { group: TextureGroup; url: string }[]): void {
    for (const { group, url } of entries) {
      this.load.image(`${KEYS[group]}-normal`, url);
    }
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.warn(`Normal map "${String(file.url)}" is missing; that art will render unlit.`);
    });
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (!this.alive) return;
      for (const { group } of entries) {
        const key = `${KEYS[group]}-normal`;
        if (!this.textures.exists(key)) continue;
        const image = this.textures.get(key).getSourceImage();
        if (image instanceof HTMLImageElement || image instanceof HTMLCanvasElement) {
          attachNormalMap(this.textures.get(KEYS[group]), image);
        }
      }
      this.lighting.refreshPipelines();
    });
    this.load.start();
  }

  private onResize(): void {
    this.camera.relayout();
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

  private handlePointer(): void {
    if (this.controls.isPaused) {
      return;
    }
    const { viewport } = this.services;
    viewport.clientToCanvas(viewport.pointer.x, viewport.pointer.y, this.canvasPoint);
    const camera = this.cameras.main;
    const x = camera.scrollX + this.canvasPoint.x;
    const y = camera.scrollY + this.canvasPoint.y;
    for (const building of this.parts.buildings) {
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
      this.lighting.register(puff, puff.texture);
      puff.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.dust.killAndHide(puff));
    }
    puff
      .setActive(true)
      .setVisible(true)
      .setDepth(DEPTH.shadow + 1)
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
    for (const area of this.parts.areas) {
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
    if (this.fpsReported || this.elapsed < 6000) {
      return;
    }
    if (delta > QUALITY.auto.stallMs) {
      this.fpsLowStreak = 0;
      return;
    }
    this.fpsTimer += delta;
    if (this.fpsTimer < 1000) {
      return;
    }
    this.fpsTimer = 0;
    // Ignore background-tab throttling; only count visible slowness, and only once the
    // automatic quality setting has had its chance to step down.
    if (
      document.visibilityState !== "visible" ||
      (this.quality.currentSetting === "auto" && this.level !== "low")
    ) {
      this.fpsLowStreak = 0;
      return;
    }
    this.fpsLowStreak =
      this.game.loop.actualFps < QUALITY.plainOfferFps ? this.fpsLowStreak + 1 : 0;
    if (this.fpsLowStreak >= 4) {
      this.fpsReported = true;
      this.services.bridge.emit("lowFps", null);
    }
  }

  private teardown(): void {
    this.alive = false;
    this.unsubscribe.forEach((off) => off());
    this.unsubscribe.length = 0;
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointer, this);
    this.cameras.main?.resetPostPipeline();
    attachWorldUniforms(this.game, null);
    this.weather?.destroy();
    this.shadows?.destroy();
    this.lighting?.destroy();
    if (this.textures.exists(KEYS.waterMask)) {
      this.textures.remove(KEYS.waterMask);
    }
    if (this.textures.exists(KEYS.shadows)) {
      this.textures.remove(KEYS.shadows);
    }
  }
}
