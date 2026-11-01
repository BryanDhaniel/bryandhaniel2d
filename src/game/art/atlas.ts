import { Painter } from "./painter";

export interface SpriteDef {
  /** Frame name, e.g. "player/down/0". Replacement atlases must use the same names. */
  name: string;
  width: number;
  height: number;
  paint: (painter: Painter) => void;
}

export interface PackedFrame {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PackedAtlas {
  width: number;
  height: number;
  frames: PackedFrame[];
}

/** Shelf packer: tallest sprites first, rows left to right, 1px gutter against bleeding. */
export function packSprites(defs: readonly SpriteDef[], maxWidth = 512, gutter = 1): PackedAtlas {
  const names = new Set<string>();
  for (const def of defs) {
    if (names.has(def.name)) {
      throw new Error(`Duplicate atlas frame "${def.name}".`);
    }
    if (def.width + gutter * 2 > maxWidth) {
      throw new Error(`Frame "${def.name}" is wider than the atlas.`);
    }
    names.add(def.name);
  }

  const sorted = [...defs].sort((a, b) => b.height - a.height || b.width - a.width);
  const frames: PackedFrame[] = [];
  let x = gutter;
  let y = gutter;
  let shelfHeight = 0;
  let usedWidth = 0;

  for (const def of sorted) {
    if (x + def.width + gutter > maxWidth) {
      x = gutter;
      y += shelfHeight + gutter;
      shelfHeight = 0;
    }
    frames.push({ name: def.name, x, y, width: def.width, height: def.height });
    x += def.width + gutter;
    usedWidth = Math.max(usedWidth, x);
    shelfHeight = Math.max(shelfHeight, def.height);
  }

  return { width: usedWidth, height: y + shelfHeight + gutter, frames };
}

/** Paints every sprite into its packed slot. */
export function paintAtlas(
  ctx: CanvasRenderingContext2D,
  defs: readonly SpriteDef[],
  packed: PackedAtlas,
): void {
  const byName = new Map(defs.map((def) => [def.name, def]));
  ctx.imageSmoothingEnabled = false;
  for (const frame of packed.frames) {
    const def = byName.get(frame.name);
    if (def) {
      def.paint(new Painter(ctx, frame.x, frame.y, frame.width, frame.height));
    }
  }
}
