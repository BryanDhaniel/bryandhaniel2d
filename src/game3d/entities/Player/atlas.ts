import { CHARACTER } from "@/game3d/config/character";
import {
  ANIMATIONS,
  DIRECTIONS,
  FRAME_COUNTS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  gridToRgba,
  playerFrame,
  type Animation,
  type Direction,
} from "./art";

/**
 * The player atlas: one row per direction (down, left, right, up) and one column per frame
 * (idle 0-1, walk 0-5, interact 0-1), described by an Aseprite-style JSON frame map whose
 * keys are `<direction>-<animation>/<frame>`. Pure: the game, the export script and the
 * contact sheet all build the same pixels.
 */

export interface AtlasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ATLAS_COLUMNS = ANIMATIONS.reduce(
  (total, animation) => total + FRAME_COUNTS[animation],
  0,
);
export const ATLAS_WIDTH = ATLAS_COLUMNS * FRAME_WIDTH;
export const ATLAS_HEIGHT = DIRECTIONS.length * FRAME_HEIGHT;

export function frameName(direction: Direction, animation: Animation, index: number): string {
  return `${direction}-${animation}/${index}`;
}

export interface AtlasFrame extends AtlasRect {
  name: string;
  direction: Direction;
  animation: Animation;
  index: number;
}

export function atlasFrames(): AtlasFrame[] {
  const frames: AtlasFrame[] = [];
  DIRECTIONS.forEach((direction, row) => {
    let column = 0;
    for (const animation of ANIMATIONS) {
      for (let index = 0; index < FRAME_COUNTS[animation]; index += 1) {
        frames.push({
          name: frameName(direction, animation, index),
          direction,
          animation,
          index,
          x: column * FRAME_WIDTH,
          y: row * FRAME_HEIGHT,
          w: FRAME_WIDTH,
          h: FRAME_HEIGHT,
        });
        column += 1;
      }
    }
  });
  return frames;
}

/** Every frame name the game needs from a sprite sheet. */
export function requiredFrameNames(): string[] {
  return atlasFrames().map((frame) => frame.name);
}

/** The atlas as RGBA pixels (row-major, top row first). */
export function buildAtlasPixels(): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  for (const frame of atlasFrames()) {
    gridToRgba(
      playerFrame(frame.direction, frame.animation, frame.index),
      pixels,
      ATLAS_WIDTH,
      frame.x,
      frame.y,
    );
  }
  return pixels;
}

const DURATIONS: Readonly<Record<Animation, number>> = {
  idle: Math.round(CHARACTER.timings.idleFrameSeconds * 1000),
  walk: Math.round(1000 / CHARACTER.timings.walkFps),
  interact: Math.round(CHARACTER.timings.interactFrameSeconds * 1000),
};

export interface AtlasJson {
  frames: Record<string, { frame: AtlasRect; duration: number }>;
  meta: {
    app: string;
    image: string;
    format: string;
    size: { w: number; h: number };
    scale: string;
    frameTags: { name: string; from: number; to: number; direction: string }[];
  };
}

/** The JSON frame map in Aseprite's "hash" format (frames keyed by name, plus tags). */
export function atlasJson(image: string): AtlasJson {
  const frames: AtlasJson["frames"] = {};
  const tags: AtlasJson["meta"]["frameTags"] = [];
  atlasFrames().forEach((frame, order) => {
    frames[frame.name] = {
      frame: { x: frame.x, y: frame.y, w: frame.w, h: frame.h },
      duration: DURATIONS[frame.animation],
    };
    if (frame.index === 0) {
      const count = FRAME_COUNTS[frame.animation];
      tags.push({
        name: `${frame.direction}-${frame.animation}`,
        from: order,
        to: order + count - 1,
        direction: "forward",
      });
    }
  });
  return {
    frames,
    meta: {
      app: "kiznaiver-village",
      image,
      format: "RGBA8888",
      size: { w: ATLAS_WIDTH, h: ATLAS_HEIGHT },
      scale: "1",
      frameTags: tags,
    },
  };
}

function isRect(value: unknown): value is AtlasRect {
  if (typeof value !== "object" || value === null) return false;
  const rect = value as Record<string, unknown>;
  return ["x", "y", "w", "h"].every((key) => typeof rect[key] === "number");
}

/**
 * Reads a frame map exported by Aseprite (hash or array format, filename format
 * `{tag}/{tagframe}`). Returns null unless every required frame is present.
 */
export function parseAtlasJson(value: unknown): Map<string, AtlasRect> | null {
  if (typeof value !== "object" || value === null) return null;
  const frames = (value as { frames?: unknown }).frames;
  const rects = new Map<string, AtlasRect>();
  const add = (name: unknown, entry: unknown) => {
    if (typeof name !== "string" || typeof entry !== "object" || entry === null) return;
    const rect = (entry as { frame?: unknown }).frame;
    if (isRect(rect)) rects.set(name.replace(/\.(png|aseprite|ase)$/i, ""), rect);
  };
  if (Array.isArray(frames)) {
    for (const entry of frames) add((entry as { filename?: unknown }).filename, entry);
  } else if (typeof frames === "object" && frames !== null) {
    for (const [name, entry] of Object.entries(frames)) add(name, entry);
  } else {
    return null;
  }
  return requiredFrameNames().every((name) => rects.has(name)) ? rects : null;
}
