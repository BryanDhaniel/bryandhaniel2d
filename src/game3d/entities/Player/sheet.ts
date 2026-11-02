import * as THREE from "three";
import { pixelCanvas, pixelTexture } from "@/game3d/textures/canvas";
import { ANIMATIONS, DIRECTIONS, FRAME_COUNTS } from "./art";
import {
  ATLAS_HEIGHT,
  ATLAS_WIDTH,
  atlasFrames,
  buildAtlasPixels,
  frameName,
  parseAtlasJson,
  type AtlasRect,
} from "./atlas";

/**
 * The player's sprite sheet in the renderer: generated from the pixel data immediately, then
 * replaced in place by the configured PNG + JSON once they load (and kept if they are missing
 * or incomplete). Frame rectangles are indexed [direction][animation][frame] so the frame loop
 * looks them up without building strings.
 */
export class PlayerSheet {
  texture: THREE.Texture;
  width = ATLAS_WIDTH;
  height = ATLAS_HEIGHT;
  /** "generated" until a file replaces it. */
  source: "generated" | "file" = "generated";
  private rects: AtlasRect[][][] = [];

  constructor() {
    const { canvas, ctx } = pixelCanvas(ATLAS_WIDTH, ATLAS_HEIGHT);
    ctx.putImageData(new ImageData(buildAtlasPixels(), ATLAS_WIDTH, ATLAS_HEIGHT), 0, 0);
    this.texture = pixelTexture(canvas);
    this.texture.name = "player";
    const generated = new Map(atlasFrames().map((frame) => [frame.name, frame]));
    this.index(generated);
  }

  rect(direction: number, animation: number, frame: number): AtlasRect | undefined {
    return this.rects[direction]?.[animation]?.[frame];
  }

  /** Loads a hand-drawn sheet (PNG + Aseprite JSON); keeps the generated one on any failure. */
  async load(image: string, json: string): Promise<boolean> {
    try {
      const response = await fetch(json);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const frames = parseAtlasJson(await response.json());
      if (!frames) throw new Error("the JSON is missing required frames");
      const loaded = await new THREE.ImageLoader().loadAsync(image);
      // A new texture (the file may differ in size from the generated atlas).
      const texture = new THREE.Texture(loaded);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.name = "player";
      texture.needsUpdate = true;
      this.texture.dispose();
      this.texture = texture;
      this.width = loaded.naturalWidth || loaded.width;
      this.height = loaded.naturalHeight || loaded.height;
      this.index(frames);
      this.source = "file";
      return true;
    } catch (error: unknown) {
      console.warn(`Player sprites "${image}" could not be used; drawing them from code.`, error);
      return false;
    }
  }

  dispose(): void {
    this.texture.dispose();
  }

  private index(frames: Map<string, AtlasRect>): void {
    this.rects = DIRECTIONS.map((direction) =>
      ANIMATIONS.map((animation) =>
        Array.from({ length: FRAME_COUNTS[animation] }, (_, frame) => {
          const rect = frames.get(frameName(direction, animation, frame));
          return rect ?? { x: 0, y: 0, w: 1, h: 1 };
        }),
      ),
    );
  }
}
