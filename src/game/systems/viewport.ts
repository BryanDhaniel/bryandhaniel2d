import { RENDER } from "@/game/config/visuals";

/**
 * How the low-resolution game canvas fits the screen.
 *
 * The world renders at its native pixel size into a small canvas (the render target); the
 * browser upscales it by an integer number of device pixels with nearest-neighbour sampling.
 * Shaders and post-processing therefore run at base resolution and can never blur the pixel
 * grid. The canvas is `margin` texels larger than the view on every side so it can be nudged
 * by sub-texel amounts (whole device pixels) for smooth camera motion.
 */
export interface ViewportLayout {
  /** Device-pixel ratio used for the calculation. */
  ratio: number;
  /** Device pixels per world texel (an integer). */
  zoom: number;
  /** Visible world texels. */
  viewWidth: number;
  viewHeight: number;
  margin: number;
  /** Canvas (render target) size in texels: the view plus the margin on both sides. */
  canvasWidth: number;
  canvasHeight: number;
  /** The clipping window that shows the view, in CSS pixels relative to the container. */
  windowLeft: number;
  windowTop: number;
  windowWidth: number;
  windowHeight: number;
}

export function computeLayout(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
): ViewportLayout {
  const ratio = Math.min(Math.max(devicePixelRatio || 1, 0.5), 3);
  const deviceWidth = Math.max(1, Math.round(cssWidth * ratio));
  const deviceHeight = Math.max(1, Math.round(cssHeight * ratio));
  const zoom = Math.max(
    1,
    Math.floor(Math.min(deviceWidth, deviceHeight) / RENDER.targetShortSide),
  );
  const viewWidth = Math.min(Math.ceil(deviceWidth / zoom), RENDER.maxViewWidth);
  const viewHeight = Math.min(Math.ceil(deviceHeight / zoom), RENDER.maxViewHeight);
  const windowDeviceWidth = Math.min(deviceWidth, viewWidth * zoom);
  const windowDeviceHeight = Math.min(deviceHeight, viewHeight * zoom);
  const margin = RENDER.cameraMargin;
  return {
    ratio,
    zoom,
    viewWidth,
    viewHeight,
    margin,
    canvasWidth: viewWidth + margin * 2,
    canvasHeight: viewHeight + margin * 2,
    windowLeft: Math.floor((deviceWidth - windowDeviceWidth) / 2) / ratio,
    windowTop: Math.floor((deviceHeight - windowDeviceHeight) / 2) / ratio,
    windowWidth: windowDeviceWidth / ratio,
    windowHeight: windowDeviceHeight / ratio,
  };
}

/** Copies a layout into an existing object so references held by the scene stay valid. */
export function assignLayout(target: ViewportLayout, source: ViewportLayout): void {
  Object.assign(target, source);
}
