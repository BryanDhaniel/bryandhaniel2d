import * as Phaser from "phaser";
import {
  ASSET_SOURCES,
  ATLAS_GROUPS,
  KEYS,
  STRIP_GROUPS,
  type AtlasGroup,
  type StripGroup,
  type TextureGroup,
} from "@/game/assets/manifest";
import {
  createAnimations,
  generateAtlas,
  generateStrip,
  generateTileset,
  missingFrames,
} from "@/game/assets/textures";
import { SCENES } from "@/game/constants";
import { isTiledMap } from "@/game/map/navigation";
import { buildTiledMap } from "@/game/map/tiled";
import { getServices } from "@/game/services";

const GROUP_LABELS: Record<AtlasGroup | StripGroup, string> = {
  characters: "Sketching the villagers",
  buildings: "Raising the buildings",
  props: "Setting up the market",
  trees: "Planting the trees",
  tufts: "Growing the grass",
};

/** Registry key for the set of texture groups that were generated rather than loaded. */
export const GENERATED_GROUPS_KEY = "generatedGroups";

/**
 * Yields to the browser between generation steps so the progress bar can paint. Uses a
 * message-channel macrotask rather than requestAnimationFrame, which never fires in a
 * background tab (e.g. a link opened with Ctrl+click) and would stall loading there.
 */
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

/**
 * Loads any swapped-in art from ASSET_SOURCES, then generates whatever is missing or failed
 * to load, reporting progress to the HTML loading screen as it goes. Normal maps and weather
 * textures are deferred to the world scene, after the first frame.
 */
export class PreloadScene extends Phaser.Scene {
  private readonly failed = new Set<string>();
  private alive = true;

  constructor() {
    super(SCENES.preload);
  }

  init(): void {
    this.alive = true;
    this.failed.clear();
    const stop = () => {
      this.alive = false;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
    this.events.once(Phaser.Scenes.Events.DESTROY, stop);
  }

  preload(): void {
    const { bridge } = getServices(this);
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.warn(
        `Asset "${file.key}" failed to load from ${String(file.url)}; generating it instead.`,
      );
      this.failed.add(file.key);
    });
    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      bridge.emit("progress", { value: 0.4 + value * 0.2, label: "Fetching art" });
    });
    if (ASSET_SOURCES.tiles) {
      this.load.image(KEYS.tiles, ASSET_SOURCES.tiles.image);
    }
    for (const group of [...ATLAS_GROUPS, ...STRIP_GROUPS]) {
      const source = ASSET_SOURCES[group];
      if (source) {
        this.load.atlas(KEYS[group], source.image, source.atlas);
      }
    }
    if (ASSET_SOURCES.map) {
      this.load.tilemapTiledJSON(KEYS.map, ASSET_SOURCES.map);
    }
  }

  create(): void {
    void this.prepare().catch((error: unknown) => {
      console.error(error);
      if (this.alive) {
        getServices(this).bridge.emit("fatal", {
          reason: "assets",
          message:
            error instanceof Error ? error.message : "The village art could not be prepared.",
        });
      }
    });
  }

  private usable(key: string): boolean {
    return this.textures.exists(key) && !this.failed.has(key);
  }

  private async prepare(): Promise<void> {
    const { bridge } = getServices(this);
    const report = (value: number, label: string) => bridge.emit("progress", { value, label });
    const generated = new Set<TextureGroup>();

    report(0.62, "Laying the paths");
    if (!this.usable(KEYS.tiles)) {
      generateTileset(this);
      generated.add("tiles");
    }
    await yieldToBrowser();

    const groups: readonly (AtlasGroup | StripGroup)[] = [...ATLAS_GROUPS, ...STRIP_GROUPS];
    let step = 0;
    for (const group of groups) {
      if (!this.alive) return;
      report(0.65 + (step / groups.length) * 0.25, GROUP_LABELS[group]);
      step += 1;
      let generate = !this.usable(KEYS[group]);
      if (!generate) {
        const missing = missingFrames(this, group);
        if (missing.length > 0) {
          console.warn(
            `The ${group} texture is missing ${missing.length} frames (e.g. "${missing[0]}"); using generated art.`,
          );
          generate = true;
        }
      }
      if (generate) {
        if (group === "trees" || group === "tufts") {
          generateStrip(this, group);
        } else {
          generateAtlas(this, group);
        }
        generated.add(group);
      }
      await yieldToBrowser();
    }

    if (!this.alive) return;
    report(0.93, "Drawing the map");
    const cached: unknown = this.cache.tilemap.exists(KEYS.map)
      ? this.cache.tilemap.get(KEYS.map)
      : null;
    const data = cached && typeof cached === "object" && "data" in cached ? cached.data : null;
    if (!isTiledMap(data) || this.failed.has(KEYS.map)) {
      if (this.cache.tilemap.exists(KEYS.map)) {
        this.cache.tilemap.remove(KEYS.map);
      }
      this.cache.tilemap.add(KEYS.map, {
        format: Phaser.Tilemaps.Formats.TILED_JSON,
        data: buildTiledMap(),
      });
    }
    createAnimations(this);
    this.registry.set(GENERATED_GROUPS_KEY, generated);

    if (!this.alive) return;
    report(1, "Welcome!");
    this.scene.start(SCENES.world);
  }
}
