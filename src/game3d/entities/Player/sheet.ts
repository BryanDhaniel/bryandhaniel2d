import * as THREE from "three";
import { pixelCanvas, pixelTexture } from "@/game3d/textures/canvas";
import { ANIMATIONS, DIRECTIONS, FRAME_COUNTS, type Direction } from "./art";
import {
  ATLAS_HEIGHT,
  ATLAS_WIDTH,
  atlasFrames,
  buildAtlasPixels,
  frameName,
  parseAtlasJson,
  type AtlasRect,
} from "./atlas";

/** Share of a frame's height (from the top) taken from the front or back view. */
const HEAD_SHARE = 0.5;

/** How a missing three-quarter view is composed: whose head, whose body, and its mirror. */
const COMPOSED: readonly {
  direction: Direction;
  head: Direction;
  body: Direction;
  mirror: Direction;
}[] = [
  { direction: "down-right", head: "down", body: "right", mirror: "down-left" },
  { direction: "up-right", head: "up", body: "right", mirror: "up-left" },
];

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
      // A new texture (the file may differ in size from the generated atlas), with any missing
      // three-quarter views composed from the sheet's own front, back and profile frames.
      const composed = composeDiagonals(loaded, frames);
      const texture = new THREE.Texture(composed.image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.name = "player";
      texture.needsUpdate = true;
      this.texture.dispose();
      this.texture = texture;
      this.width = composed.width;
      this.height = composed.height;
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

/**
 * Adds the three-quarter frames a hand-drawn sheet lacks: each is the profile frame with the
 * top half replaced by the front (or back) frame nudged a pixel toward the turn, and the
 * left-facing ones are mirrors. They go in a strip under the original image; `frames` gains
 * their rectangles. Sheets that have every frame come back unchanged.
 */
function composeDiagonals(
  image: HTMLImageElement,
  frames: Map<string, AtlasRect>,
): { image: HTMLImageElement | HTMLCanvasElement; width: number; height: number } {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const missing: { name: string; head: AtlasRect; body: AtlasRect; mirrorOf: string | null }[] = [];
  for (const recipe of COMPOSED) {
    for (const animation of ANIMATIONS) {
      for (let frame = 0; frame < FRAME_COUNTS[animation]; frame += 1) {
        const name = frameName(recipe.direction, animation, frame);
        const head = frames.get(frameName(recipe.head, animation, frame));
        const body = frames.get(frameName(recipe.body, animation, frame));
        if (!head || !body) continue;
        const mirror = frameName(recipe.mirror, animation, frame);
        if (!frames.has(name)) missing.push({ name, head, body, mirrorOf: null });
        if (!frames.has(mirror)) missing.push({ name: mirror, head, body, mirrorOf: name });
      }
    }
  }
  if (missing.length === 0) return { image, width, height };
  const cellW = Math.max(...missing.map((entry) => entry.body.w));
  const cellH = Math.max(...missing.map((entry) => entry.body.h));
  const columns = Math.max(1, Math.floor(width / cellW));
  const rows = Math.ceil(missing.length / columns);
  const { canvas, ctx } = pixelCanvas(Math.max(width, cellW), height + rows * cellH);
  ctx.drawImage(image, 0, 0);
  missing.forEach((entry, index) => {
    const x = (index % columns) * cellW;
    const y = height + Math.floor(index / columns) * cellH;
    const { head, body } = entry;
    const split = Math.round(body.h * HEAD_SHARE);
    ctx.save();
    if (entry.mirrorOf) {
      // Mirror image of the right-facing composite: draw it flipped about the cell's centre.
      ctx.translate(x + body.w, 0);
      ctx.scale(-1, 1);
      ctx.translate(-x, 0);
    }
    ctx.drawImage(image, body.x, body.y, body.w, body.h, x, y, body.w, body.h);
    ctx.clearRect(x, y, body.w, split);
    ctx.drawImage(image, head.x, head.y, head.w, split, x + 1, y, head.w, split);
    ctx.restore();
    frames.set(entry.name, { x, y, w: body.w, h: body.h });
  });
  return { image: canvas, width: canvas.width, height: canvas.height };
}
