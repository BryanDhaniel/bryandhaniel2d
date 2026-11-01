import * as Phaser from "phaser";
import { SCENES } from "@/game/constants";
import { getServices } from "@/game/services";

/** Confirms the renderer is WebGL, then hands over to the preloader. */
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
    bridge.emit("progress", { value: 0.4, label: "Starting the engine" });
    this.scene.start(SCENES.preload);
  }
}
