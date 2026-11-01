import { packSprites, paintAtlas, type PackedAtlas, type SpriteDef } from "@/game/art/atlas";
import { PALETTE } from "@/game/palette";
import { sunPose } from "@/game/lighting/DayNightCycle";
import { SUN } from "@/game/config/visuals";

/**
 * Directional shadows are pre-baked per sun position: each caster's silhouette is squashed to
 * the shadow length and sheared toward the side away from the sun, with nearest-neighbour
 * sampling so the result stays on the pixel grid. Frames are `<caster>/<step>`.
 */

export interface ShadowGeometry {
  width: number;
  height: number;
  /** Where the caster's bottom-left corner lands inside the frame. */
  anchorX: number;
  anchorY: number;
  /** Canvas transform (a, b, c, d, e, f) mapping the silhouette into the frame. */
  matrix: readonly [number, number, number, number, number, number];
}

/**
 * Projection of a silhouette standing on its bottom edge: a point `h` pixels above the base
 * moves `shear * h` sideways and `length * h` up the screen.
 */
export function shadowGeometry(
  width: number,
  height: number,
  pose: { shear: number; length: number },
): ShadowGeometry {
  const reach = Math.abs(pose.shear) * height;
  const anchorX = pose.shear < 0 ? Math.ceil(reach) : 0;
  const frameHeight = Math.max(1, Math.ceil(height * pose.length));
  return {
    width: Math.ceil(width + reach) + 1,
    height: frameHeight,
    anchorX,
    anchorY: frameHeight,
    matrix: [1, 0, -pose.shear, pose.length, pose.shear * height + anchorX, 0],
  };
}

export interface ShadowCaster {
  /** Unique caster name, e.g. "building/home" or "tree/oak". */
  name: string;
  width: number;
  height: number;
  /** Draws the caster's opaque pixels at (0, 0); colour doesn't matter. */
  draw: (ctx: CanvasRenderingContext2D) => void;
}

export interface BakedFrame {
  anchorX: number;
  anchorY: number;
  width: number;
  height: number;
}

export interface BakedShadows {
  canvas: HTMLCanvasElement;
  packed: PackedAtlas;
  frames: Map<string, BakedFrame>;
}

function silhouette(caster: ShadowCaster): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, caster.width);
  canvas.height = Math.max(1, caster.height);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    caster.draw(ctx);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

/** Soft dithered band at the base of a building, `width` pixels wide. */
function paintBaseOcclusion(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  width: number,
): void {
  ctx.fillStyle = PALETTE.ink;
  const rows = 7;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const edge = Math.min(x, width - 1 - x);
      const inset = edge < 3 ? 3 - edge : 0;
      const density = y + inset;
      const keep =
        density <= 1
          ? true
          : density <= 3
            ? (x + y) % 2 === 0
            : density <= 5
              ? (x + y) % 4 === 0
              : false;
      if (keep) ctx.fillRect(originX + x, originY + y, 1, 1);
    }
  }
}

export function aoFrameName(width: number): string {
  return `ao/building-${width}`;
}

/** Bakes every caster at every sun step, plus base occlusion bands of the given widths. */
export function bakeShadows(
  casters: readonly ShadowCaster[],
  aoWidths: readonly number[],
): BakedShadows {
  const frames = new Map<string, BakedFrame>();
  const defs: SpriteDef[] = [];
  for (const caster of casters) {
    const shape = silhouette(caster);
    for (let step = 0; step < SUN.steps; step += 1) {
      const geometry = shadowGeometry(caster.width, caster.height, sunPose(step));
      const name = `${caster.name}/${step}`;
      frames.set(name, {
        anchorX: geometry.anchorX,
        anchorY: geometry.anchorY,
        width: geometry.width,
        height: geometry.height,
      });
      defs.push({
        name,
        width: geometry.width,
        height: geometry.height,
        paint: (p) => {
          const [a, b, c, d, e, f] = geometry.matrix;
          p.ctx.save();
          p.ctx.beginPath();
          p.ctx.rect(p.originX, p.originY, geometry.width, geometry.height);
          p.ctx.clip();
          p.ctx.imageSmoothingEnabled = false;
          p.ctx.setTransform(a, b, c, d, p.originX + e, p.originY + f);
          p.ctx.drawImage(shape, 0, 0);
          p.ctx.restore();
        },
      });
    }
  }
  for (const width of new Set(aoWidths)) {
    const name = aoFrameName(width);
    frames.set(name, { anchorX: 0, anchorY: 0, width, height: 7 });
    defs.push({
      name,
      width,
      height: 7,
      paint: (p) => paintBaseOcclusion(p.ctx, p.originX, p.originY, width),
    });
  }
  const packed = packSprites(defs, 1024);
  const canvas = document.createElement("canvas");
  canvas.width = packed.width;
  canvas.height = packed.height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    paintAtlas(ctx, defs, packed);
  }
  return { canvas, packed, frames };
}
