import { CAMERA } from "@/game/constants";

export interface ViewportLayout {
  /** Integer world-to-screen scale. */
  zoom: number;
  /** Camera viewport inside the canvas, in canvas (device) pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Picks an integer zoom for the canvas size (in device pixels) so every texel is a whole
 * number of screen pixels, then letterboxes when the view would show more of the world than
 * intended or more than the world itself.
 */
export function computeViewport(
  canvasWidth: number,
  canvasHeight: number,
  worldWidth: number,
  worldHeight: number,
): ViewportLayout {
  const shortSide = Math.min(canvasWidth, canvasHeight);
  const zoom = Math.max(1, Math.floor(shortSide / CAMERA.targetShortSide));
  const maxWidth = Math.min(CAMERA.maxViewWidth, worldWidth) * zoom;
  const maxHeight = Math.min(CAMERA.maxViewHeight, worldHeight) * zoom;
  const width = Math.min(canvasWidth, maxWidth);
  const height = Math.min(canvasHeight, maxHeight);
  return {
    zoom,
    width,
    height,
    x: Math.floor((canvasWidth - width) / 2),
    y: Math.floor((canvasHeight - height) / 2),
  };
}

/** Canvas backing size in device pixels for a CSS-sized parent. */
export function deviceCanvasSize(cssWidth: number, cssHeight: number, devicePixelRatio: number) {
  const ratio = Math.min(Math.max(devicePixelRatio || 1, 0.5), 3);
  return {
    ratio,
    width: Math.max(1, Math.round(cssWidth * ratio)),
    height: Math.max(1, Math.round(cssHeight * ratio)),
  };
}
