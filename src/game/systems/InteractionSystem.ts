import type { EventPort, Events, ScreenPoint } from "@/game/bridge";
import type { Building } from "@/game/entities/Building";
import type { SmoothCamera } from "./SmoothCamera";

/**
 * Tracks which building the player is standing at. The "E / Tap" prompt itself is HTML (so it
 * stays crisp and readable whatever the lighting does); this system tells the UI when to show
 * it and where, in container CSS pixels, whenever that spot moves by a whole pixel.
 */
export class InteractionSystem {
  private current: Building | null = null;
  private readonly anchor: ScreenPoint = { x: 0, y: 0 };
  private lastX = Number.NaN;
  private lastY = Number.NaN;

  constructor(
    private readonly buildings: readonly Building[],
    private readonly bridge: EventPort<Events>,
  ) {}

  get nearest(): Building | null {
    return this.current;
  }

  update(feetX: number, feetY: number, camera: SmoothCamera): void {
    let best: Building | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const building of this.buildings) {
      if (!building.isOnPorch(feetX, feetY)) {
        continue;
      }
      const distance = building.distanceToDoor(feetX, feetY);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = building;
      }
    }
    if (best !== this.current) {
      this.current = best;
      this.lastX = Number.NaN;
      this.bridge.emit("prompt", { visible: best !== null });
      this.bridge.emit(
        "near",
        best ? { sectionId: best.sectionId, label: best.label } : { sectionId: null, label: null },
      );
    }
    if (best) {
      camera.worldToContainer(best.promptX, best.promptY, this.anchor);
      this.anchor.x = Math.round(this.anchor.x);
      this.anchor.y = Math.round(this.anchor.y);
      if (this.anchor.x !== this.lastX || this.anchor.y !== this.lastY) {
        this.lastX = this.anchor.x;
        this.lastY = this.anchor.y;
        this.bridge.emit("promptPosition", this.anchor);
      }
    }
  }

  open(building: Building): void {
    this.bridge.emit("open", { sectionId: building.sectionId });
  }
}
