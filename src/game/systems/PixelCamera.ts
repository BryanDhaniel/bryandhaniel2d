import * as Phaser from "phaser";

/**
 * With `roundPixels`, Phaser floors the camera scroll to whole *world* pixels, so a lerping
 * camera at zoom 5 jumps 5 screen pixels at a time and the player jitters against the map.
 *
 * This camera keeps scroll sub-texel (smooth lerp) but still snaps every sprite's quad to
 * whole *screen* pixels at integer zoom, so art stays perfectly crisp. Enable it with
 * `setRoundPixels(false)`; the snapping below is independent of that flag.
 */
export class PixelCamera extends Phaser.Cameras.Scene2D.Camera {
  override preRender(): void {
    super.preRender();
    (this as { renderRoundPixels: boolean }).renderRoundPixels =
      Number.isInteger(this.zoomX) && Number.isInteger(this.zoomY);
  }
}
