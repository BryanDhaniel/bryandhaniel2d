import * as Phaser from "phaser";
import { SCENES } from "@/game/constants";
import { getServices } from "@/game/services";
import { registerWorldPipelines } from "@/game/shaders/pipelines";
import { registerPostPipelines } from "@/game/shaders/postfx";

/** Confirms the renderer is WebGL, registers the custom pipelines, then starts the preloader. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.boot);
  }

  create(): void {
    const { bridge } = getServices(this);
    if (this.game.renderer.type !== Phaser.WEBGL) {
      bridge.emit("fatal", { reason: "webgl", message: "WebGL is not available in this browser." });
      return;
    }
    try {
      registerWorldPipelines(this.game);
      registerPostPipelines(this.game);
    } catch (error) {
      console.error(error);
      bridge.emit("fatal", {
        reason: "webgl",
        message: "This browser's graphics driver couldn't compile the village shaders.",
      });
      return;
    }
    bridge.emit("progress", { value: 0.4, label: "Starting the engine" });
    this.scene.start(SCENES.preload);
  }
}
