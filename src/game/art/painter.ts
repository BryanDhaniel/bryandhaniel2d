import { PALETTE, type PaletteName } from "@/game/palette";
import { drawArt, hash2, type DrawArtOptions, type PixelArt } from "./pixels";

/**
 * Integer-only drawing on a canvas region using palette names, so procedurally drawn tiles
 * and buildings stay on the same palette and pixel grid as the hand-authored pixel data.
 */
export class Painter {
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly originX = 0,
    readonly originY = 0,
    readonly width = 16,
    readonly height = 16,
  ) {}

  px(x: number, y: number, color: PaletteName): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return;
    }
    this.ctx.fillStyle = PALETTE[color];
    this.ctx.fillRect(this.originX + x, this.originY + y, 1, 1);
  }

  rect(x: number, y: number, w: number, h: number, color: PaletteName): void {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(this.width, x + w);
    const y1 = Math.min(this.height, y + h);
    if (x1 <= x0 || y1 <= y0) {
      return;
    }
    this.ctx.fillStyle = PALETTE[color];
    this.ctx.fillRect(this.originX + x0, this.originY + y0, x1 - x0, y1 - y0);
  }

  hline(x: number, y: number, w: number, color: PaletteName): void {
    this.rect(x, y, w, 1, color);
  }

  vline(x: number, y: number, h: number, color: PaletteName): void {
    this.rect(x, y, 1, h, color);
  }

  /** 1px border inside the given rectangle. */
  frame(x: number, y: number, w: number, h: number, color: PaletteName): void {
    this.hline(x, y, w, color);
    this.hline(x, y + h - 1, w, color);
    this.vline(x, y, h, color);
    this.vline(x + w - 1, y, h, color);
  }

  /** Filled box with a 1px outline. */
  box(x: number, y: number, w: number, h: number, fill: PaletteName, outline: PaletteName): void {
    this.rect(x, y, w, h, fill);
    this.frame(x, y, w, h, outline);
  }

  /** Checkerboard dither of `color` over a rectangle. */
  dither(x: number, y: number, w: number, h: number, color: PaletteName, phase = 0): void {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        if ((xx + yy + phase) % 2 === 0) {
          this.px(xx, yy, color);
        }
      }
    }
  }

  art(art: PixelArt, x: number, y: number, options?: DrawArtOptions): void {
    drawArt(this.ctx, art, this.originX + x, this.originY + y, options);
  }

  /** A painter for a sub-rectangle, clipped to it. */
  sub(x: number, y: number, w: number, h: number): Painter {
    return new Painter(this.ctx, this.originX + x, this.originY + y, w, h);
  }
}

export type Mask = (x: number, y: number) => boolean;

export interface BlobColors {
  outline: PaletteName | null;
  base: PaletteName;
  light: PaletteName;
  shade: PaletteName;
  /** Sparse texture speckles. */
  speckle?: PaletteName;
  speckleDensity?: number;
  seed?: number;
}

/**
 * Paints a shaded, outlined shape from a mask, lit from the top-left.
 * `edgeIsOpen(x, y)` decides whether pixels past the region edge count as outside the shape
 * (used by autotiles so connected sides don't get an outline).
 */
export function paintBlob(
  painter: Painter,
  mask: Mask,
  colors: BlobColors,
  area = { x: 0, y: 0, w: painter.width, h: painter.height },
  edgeIsOpen: (x: number, y: number) => boolean = () => true,
): void {
  const inside = (x: number, y: number): boolean => {
    if (x < area.x || y < area.y || x >= area.x + area.w || y >= area.y + area.h) {
      return !edgeIsOpen(x, y);
    }
    return mask(x, y);
  };
  for (let y = area.y; y < area.y + area.h; y += 1) {
    for (let x = area.x; x < area.x + area.w; x += 1) {
      if (!mask(x, y)) {
        continue;
      }
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (edge && colors.outline) {
        painter.px(x, y, colors.outline);
        continue;
      }
      let color: PaletteName = colors.base;
      if (!inside(x - 2, y - 2) || !inside(x - 1, y - 2)) {
        color = colors.light;
      } else if (!inside(x + 2, y + 2) || !inside(x + 1, y + 2)) {
        color = colors.shade;
      } else if (
        colors.speckle &&
        hash2(x, y, colors.seed ?? 3) < (colors.speckleDensity ?? 0.08)
      ) {
        color = colors.speckle;
      }
      painter.px(x, y, color);
    }
  }
}

export function circle(cx: number, cy: number, r: number): Mask {
  const r2 = r * r + r * 0.8;
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= r2;
  };
}

export function ellipse(cx: number, cy: number, rx: number, ry: number): Mask {
  return (x, y) => {
    const dx = (x + 0.5 - cx) / rx;
    const dy = (y + 0.5 - cy) / ry;
    return dx * dx + dy * dy <= 1;
  };
}

export function union(...masks: Mask[]): Mask {
  return (x, y) => masks.some((mask) => mask(x, y));
}

export function shifted(mask: Mask, dx: number, dy: number): Mask {
  return (x, y) => mask(x - dx, y - dy);
}
