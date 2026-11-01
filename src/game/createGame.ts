import * as Phaser from "phaser";
import type { GameBridge } from "./bridge";
import { PALETTE } from "./palette";
import { BootScene } from "./scenes/BootScene";
import { PreloadScene } from "./scenes/PreloadScene";
import { WorldScene } from "./scenes/WorldScene";
import { SERVICES_KEY, type GameOptions, type Services } from "./services";
import type { AudioSystem } from "./systems/audio";
import { deviceCanvasSize } from "./systems/viewport";

export interface GameHandle {
  destroy(): void;
}

export interface CreateGameOptions {
  parent: HTMLElement;
  bridge: GameBridge;
  audio: AudioSystem;
  options: GameOptions;
}

/**
 * Boots Phaser inside `parent`. The canvas is sized in device pixels (so integer camera zoom
 * maps texels to whole screen pixels) and CSS-scaled back down to the parent's size.
 * Returns a handle whose destroy() is safe to call from a React effect cleanup.
 */
export function createGame({ parent, bridge, audio, options }: CreateGameOptions): GameHandle {
  const scoped = bridge.scope();
  const services: Services = { bridge: scoped, audio, options };
  const initial = deviceCanvasSize(
    parent.clientWidth,
    parent.clientHeight,
    window.devicePixelRatio,
  );

  let game: Phaser.Game;
  try {
    game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent,
      width: initial.width,
      height: initial.height,
      backgroundColor: PALETTE.ink,
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      banner: false,
      disableContextMenu: true,
      scale: { mode: Phaser.Scale.NONE, zoom: 1 / initial.ratio },
      physics: { default: "arcade", arcade: { debug: false, fixedStep: false } },
      // Sound is handled by AudioSystem, which is shared with the React UI.
      audio: { noAudio: true },
      input: { keyboard: { target: parent }, activePointers: 3 },
      render: { powerPreference: "high-performance" },
      callbacks: {
        preBoot: (instance) => {
          instance.registry.set(SERVICES_KEY, services);
        },
      },
      scene: [BootScene, PreloadScene, WorldScene],
    });
  } catch (error) {
    scoped.dispose();
    // A renderer that failed mid-boot may already have attached its canvas.
    parent.querySelectorAll("canvas").forEach((canvas) => canvas.remove());
    bridge.emit("fatal", {
      reason: "webgl",
      message: error instanceof Error ? error.message : "The game engine could not start.",
    });
    return { destroy: () => {} };
  }

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
  game.canvas.addEventListener("webglcontextlost", onContextLost);

  let last = { width: initial.width, height: initial.height, ratio: initial.ratio };
  const resize = () => {
    const next = deviceCanvasSize(parent.clientWidth, parent.clientHeight, window.devicePixelRatio);
    if (next.width === last.width && next.height === last.height && next.ratio === last.ratio) {
      return;
    }
    last = next;
    game.scale.setZoom(1 / next.ratio);
    game.scale.resize(next.width, next.height);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(parent);
  // devicePixelRatio changes (browser zoom, moving between monitors) don't resize the parent.
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
      game.canvas?.removeEventListener("webglcontextlost", onContextLost);
      // Phaser tears down on its next frame; hide the canvas now so a strict-mode remount
      // never shows two, then release the GL context instead of waiting for GC.
      if (game.canvas) {
        game.canvas.style.display = "none";
      }
      game.events.once(Phaser.Core.Events.DESTROY, () => {
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
        gl = null;
      });
      game.destroy(true);
    },
  };
}
