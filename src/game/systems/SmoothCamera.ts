import type * as Phaser from "phaser";
import type { ViewportLayout } from "./viewport";

/**
 * Pixel-perfect camera with smooth motion.
 *
 * The camera's own scroll is always a whole number of texels, so every sprite, tile, light and
 * post effect lands on the pixel grid of the low-resolution canvas. The leftover fraction is
 * applied by shifting the upscaled canvas by whole *device* pixels, so the view still glides
 * instead of stepping a full texel (often 4-6 screen pixels) at a time.
 */
export class SmoothCamera {
  /** Top-left of the visible view in world pixels (fractional). */
  scrollX = 0;
  scrollY = 0;
  private offsetX = Number.NaN;
  private offsetY = Number.NaN;

  constructor(
    private readonly camera: Phaser.Cameras.Scene2D.Camera,
    private readonly layout: ViewportLayout,
    private readonly worldWidth: number,
    private readonly worldHeight: number,
    private readonly applyOffset: (deviceX: number, deviceY: number) => void,
  ) {}

  /** Centres on a point immediately (no easing). */
  snapTo(x: number, y: number): void {
    this.scrollX = this.clampX(x - this.layout.viewWidth / 2);
    this.scrollY = this.clampY(y - this.layout.viewHeight / 2);
    this.apply();
  }

  /** Eases toward a point; `lerp` is the per-60Hz-frame blend, made frame-rate independent. */
  update(x: number, y: number, deltaMs: number, lerp: number): void {
    const t = 1 - Math.pow(1 - lerp, deltaMs / (1000 / 60));
    const targetX = this.clampX(x - this.layout.viewWidth / 2);
    const targetY = this.clampY(y - this.layout.viewHeight / 2);
    this.scrollX += (targetX - this.scrollX) * t;
    this.scrollY += (targetY - this.scrollY) * t;
    // Settle exactly once within a hundredth of a texel to stop endless micro-updates.
    if (Math.abs(targetX - this.scrollX) < 0.01) this.scrollX = targetX;
    if (Math.abs(targetY - this.scrollY) < 0.01) this.scrollY = targetY;
    this.apply();
  }

  /** Re-clamps after the view size changes. */
  relayout(): void {
    this.scrollX = this.clampX(this.scrollX);
    this.scrollY = this.clampY(this.scrollY);
    this.offsetX = Number.NaN;
    this.offsetY = Number.NaN;
    this.apply();
  }

  /** Converts a world position to CSS pixels inside the game container. */
  worldToContainer(x: number, y: number, out: { x: number; y: number }): void {
    const scale = this.layout.zoom / this.layout.ratio;
    out.x = this.layout.windowLeft + (x - this.scrollX) * scale;
    out.y = this.layout.windowTop + (y - this.scrollY) * scale;
  }

  private clampX(value: number): number {
    const view = this.layout.viewWidth;
    if (this.worldWidth <= view) return (this.worldWidth - view) / 2;
    return Math.min(Math.max(value, 0), this.worldWidth - view);
  }

  private clampY(value: number): number {
    const view = this.layout.viewHeight;
    if (this.worldHeight <= view) return (this.worldHeight - view) / 2;
    return Math.min(Math.max(value, 0), this.worldHeight - view);
  }

  private apply(): void {
    const margin = this.layout.margin;
    const wholeX = Math.floor(this.scrollX);
    const wholeY = Math.floor(this.scrollY);
    this.camera.setScroll(wholeX - margin, wholeY - margin);
    const zoom = this.layout.zoom;
    const offsetX = -(margin * zoom + Math.round((this.scrollX - wholeX) * zoom));
    const offsetY = -(margin * zoom + Math.round((this.scrollY - wholeY) * zoom));
    if (offsetX !== this.offsetX || offsetY !== this.offsetY) {
      this.offsetX = offsetX;
      this.offsetY = offsetY;
      this.applyOffset(offsetX, offsetY);
    }
  }
}
