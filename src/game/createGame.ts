import * as Phaser from "phaser";
import type { GameBridge } from "./bridge";
import { LIGHTING } from "./config/visuals";
import { PALETTE } from "./palette";
import { BootScene } from "./scenes/BootScene";
import { PreloadScene } from "./scenes/PreloadScene";
import { WorldScene } from "./scenes/WorldScene";
import { SERVICES_KEY, type GameOptions, type Services, type ViewportService } from "./services";
import type { AudioSystem } from "./systems/audio";
import { assignLayout, computeLayout, type ViewportLayout } from "./systems/viewport";

export interface GameHandle {
  destroy(): void;
}

export interface CreateGameOptions {
  /** Focusable element that fills the game area; receives keyboard input. */
  container: HTMLElement;
  /** Clipping window inside the container; the canvas is mounted here. */
  viewport: HTMLElement;
  bridge: GameBridge;
  audio: AudioSystem;
  options: GameOptions;
}

function placeWindow(viewport: HTMLElement, layout: ViewportLayout): void {
  viewport.style.left = `${layout.windowLeft}px`;
  viewport.style.top = `${layout.windowTop}px`;
  viewport.style.width = `${layout.windowWidth}px`;
  viewport.style.height = `${layout.windowHeight}px`;
}

function sameLayout(a: ViewportLayout, b: ViewportLayout): boolean {
  return (
    a.ratio === b.ratio &&
    a.zoom === b.zoom &&
    a.canvasWidth === b.canvasWidth &&
    a.canvasHeight === b.canvasHeight &&
    a.windowLeft === b.windowLeft &&
    a.windowTop === b.windowTop &&
    a.windowWidth === b.windowWidth &&
    a.windowHeight === b.windowHeight
  );
}

/**
 * Boots Phaser with a low-resolution canvas: one canvas pixel per world texel, upscaled by an
 * integer number of device pixels with nearest-neighbour filtering, so lighting, shaders and
 * post-processing all happen at base resolution and the pixel grid stays crisp.
 * Returns a handle whose destroy() is safe to call from a React effect cleanup.
 */
export function createGame({
  container,
  viewport,
  bridge,
  audio,
  options,
}: CreateGameOptions): GameHandle {
  const scoped = bridge.scope();
  const layout = computeLayout(
    container.clientWidth,
    container.clientHeight,
    window.devicePixelRatio,
  );
  placeWindow(viewport, layout);

  let canvas: HTMLCanvasElement | null = null;
  const pointer = { x: 0, y: 0 };
  // Pointer events fire before the mouse/touch events Phaser listens to, so the scene always
  // sees the exact press position (the canvas moves by sub-texel amounts every frame).
  const onPointerDown = (event: PointerEvent) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  };
  container.addEventListener("pointerdown", onPointerDown, { capture: true });
  const viewportService: ViewportService = {
    layout,
    pointer,
    setOffset: (deviceX, deviceY) => {
      if (canvas) {
        canvas.style.transform = `translate(${deviceX / layout.ratio}px, ${deviceY / layout.ratio}px)`;
      }
    },
    clientToCanvas: (clientX, clientY, out) => {
      if (!canvas) {
        out.x = 0;
        out.y = 0;
        return;
      }
      const rect = canvas.getBoundingClientRect();
      out.x = ((clientX - rect.left) * layout.canvasWidth) / Math.max(1, rect.width);
      out.y = ((clientY - rect.top) * layout.canvasHeight) / Math.max(1, rect.height);
    },
  };
  const services: Services = { bridge: scoped, audio, options, viewport: viewportService };

  let game: Phaser.Game;
  try {
    game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent: viewport,
      width: layout.canvasWidth,
      height: layout.canvasHeight,
      backgroundColor: PALETTE.ink,
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      banner: false,
      disableContextMenu: true,
      scale: { mode: Phaser.Scale.NONE, zoom: layout.zoom / layout.ratio },
      physics: { default: "arcade", arcade: { debug: false, fixedStep: false } },
      // Sound is handled by AudioSystem, which is shared with the React UI.
      audio: { noAudio: true },
      input: { keyboard: { target: container }, activePointers: 3 },
      render: { powerPreference: "high-performance", maxLights: LIGHTING.maxLights },
      callbacks: {
        preBoot: (instance) => {
          instance.registry.set(SERVICES_KEY, services);
        },
      },
      scene: [BootScene, PreloadScene, WorldScene],
    });
  } catch (error) {
    scoped.dispose();
    container.removeEventListener("pointerdown", onPointerDown, { capture: true });
    // A renderer that failed mid-boot may already have attached its canvas.
    viewport.querySelectorAll("canvas").forEach((element) => element.remove());
    bridge.emit("fatal", {
      reason: "webgl",
      message: error instanceof Error ? error.message : "The game engine could not start.",
    });
    return { destroy: () => {} };
  }

  canvas = game.canvas;
  canvas.style.position = "absolute";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.transformOrigin = "0 0";

  let gl: WebGLRenderingContext | null = null;
  game.events.once(Phaser.Core.Events.READY, () => {
    const renderer = game.renderer;
    if (renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      gl = renderer.gl;
    }
  });

  const onContextLost = () => {
    window.setTimeout(() => {
      if (gl?.isContextLost()) {
        scoped.emit("fatal", { reason: "webgl", message: "The graphics context was lost." });
      }
    }, 3000);
  };
  canvas.addEventListener("webglcontextlost", onContextLost);

  const resize = () => {
    const next = computeLayout(
      container.clientWidth,
      container.clientHeight,
      window.devicePixelRatio,
    );
    if (sameLayout(next, layout)) {
      return;
    }
    assignLayout(layout, next);
    placeWindow(viewport, layout);
    game.scale.setZoom(layout.zoom / layout.ratio);
    game.scale.resize(layout.canvasWidth, layout.canvasHeight);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  // devicePixelRatio changes (browser zoom, moving between monitors) don't resize the container.
  const dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  dprQuery.addEventListener("change", resize);

  let destroyed = false;
  return {
    destroy: () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      scoped.dispose();
      observer.disconnect();
      dprQuery.removeEventListener("change", resize);
      container.removeEventListener("pointerdown", onPointerDown, { capture: true });
      canvas?.removeEventListener("webglcontextlost", onContextLost);
      // Phaser tears down on its next frame; hide the canvas now so a strict-mode remount
      // never shows two, then release the GL context instead of waiting for GC.
      if (canvas) {
        canvas.style.display = "none";
      }
      game.events.once(Phaser.Core.Events.DESTROY, () => {
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
        gl = null;
      });
      game.destroy(true);
    },
  };
}
