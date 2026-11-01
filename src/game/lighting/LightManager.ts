import type * as Phaser from "phaser";
import { LIGHTING, LIGHT_STYLES, type LightKind } from "@/game/config/visuals";
import { PALETTE } from "@/game/palette";
import { PIPELINES, type WorldUniforms } from "@/game/shaders/pipelines";

type PipelineObject = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Pipeline;

interface LitObject {
  object: PipelineObject;
  texture: Phaser.Textures.Texture;
  wind: boolean;
}

interface LightSource {
  kind: LightKind;
  x: number;
  y: number;
  radius: number;
  r: number;
  g: number;
  b: number;
  intensity: number;
  flicker: number;
  nightOnly: boolean;
  blink: number;
  phase: number;
  enabled: boolean;
  /** Extra intensity that decays each frame (forge sparks). */
  boost: number;
  priority: boolean;
}

export interface LightHandle {
  readonly index: number;
}

function hexToFloats(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** Does this texture carry a normal map for the frame's source image? */
export function hasNormalMap(texture: Phaser.Textures.Texture): boolean {
  return texture.dataSource.length > 0;
}

/**
 * Owns the light sources and decides which world objects render lit.
 *
 * Each frame, `update()` culls sources to the ones that reach the camera view, keeps the
 * closest `maxLights` (the player's light first) and writes them into the shared uniform
 * arrays. Nothing is allocated per frame: candidates are tracked in fixed-size typed arrays.
 */
export class LightManager {
  private readonly sources: LightSource[] = [];
  private readonly objects: LitObject[] = [];
  private readonly slotIndex: Int16Array;
  private readonly slotDistance: Float32Array;
  private lightingEnabled = false;

  constructor(private readonly uniforms: WorldUniforms) {
    this.slotIndex = new Int16Array(LIGHTING.maxLights);
    this.slotDistance = new Float32Array(LIGHTING.maxLights);
  }

  get enabled(): boolean {
    return this.lightingEnabled;
  }

  addLight(kind: LightKind, x: number, y: number, priority = false): LightHandle {
    const style = LIGHT_STYLES[kind];
    const [r, g, b] = hexToFloats(PALETTE[style.color]);
    this.sources.push({
      kind,
      x,
      y,
      radius: style.radius,
      r,
      g,
      b,
      intensity: style.intensity,
      flicker: style.flicker,
      nightOnly: style.nightOnly,
      blink: style.blink,
      phase: (x * 0.37 + y * 0.71) % (Math.PI * 2),
      enabled: true,
      boost: 0,
      priority,
    });
    return { index: this.sources.length - 1 };
  }

  move(handle: LightHandle, x: number, y: number): void {
    const source = this.sources[handle.index];
    if (source) {
      source.x = x;
      source.y = y;
    }
  }

  pulse(handle: LightHandle, amount: number): void {
    const source = this.sources[handle.index];
    if (source) {
      source.boost = Math.max(source.boost, amount);
    }
  }

  /** Registers a world object; it renders lit when lighting is on and its texture has normals. */
  register(object: PipelineObject, texture: Phaser.Textures.Texture, wind = false): void {
    this.objects.push({ object, texture, wind });
    this.applyPipeline(this.objects[this.objects.length - 1]);
  }

  unregister(object: PipelineObject): void {
    const index = this.objects.findIndex((entry) => entry.object === object);
    if (index >= 0) {
      this.objects.splice(index, 1);
    }
  }

  /** Switches every registered object between the lit and unlit pipelines. */
  setLightingEnabled(enabled: boolean): void {
    this.lightingEnabled = enabled;
    this.refreshPipelines();
  }

  /** Re-evaluates pipelines, e.g. after normal maps finish loading. */
  refreshPipelines(): void {
    for (const entry of this.objects) {
      this.applyPipeline(entry);
    }
  }

  /**
   * Culls and uploads lights. `view` is the camera's world view; `lightsOn` comes from the day
   * cycle; `ambient` is already multiplied by weather.
   */
  update(
    time: number,
    view: Phaser.Geom.Rectangle,
    scrollX: number,
    scrollY: number,
    lightsOn: number,
    ambient: Float32Array,
  ): void {
    const uniforms = this.uniforms;
    uniforms.ambient[0] = ambient[0] ?? 1;
    uniforms.ambient[1] = ambient[1] ?? 1;
    uniforms.ambient[2] = ambient[2] ?? 1;

    const max = LIGHTING.maxLights;
    let filled = 0;
    const centerX = view.centerX;
    const centerY = view.centerY;
    const margin = LIGHTING.cullMargin;
    const seconds = time / 1000;

    for (let i = 0; i < this.sources.length; i += 1) {
      const source = this.sources[i];
      if (!source) continue;
      source.boost *= 0.88;
      if (!source.enabled) continue;
      const strength = this.strength(source, seconds, lightsOn);
      if (strength <= 0.02) continue;
      const reach = source.radius + margin;
      if (
        source.x + reach < view.x ||
        source.x - reach > view.right ||
        source.y + reach < view.y ||
        source.y - reach > view.bottom
      ) {
        continue;
      }
      const dx = source.x - centerX;
      const dy = source.y - centerY;
      const distance = source.priority ? -1 : dx * dx + dy * dy;
      // Insertion into the sorted fixed-size candidate list.
      let slot = filled;
      if (filled < max) {
        filled += 1;
      } else if (distance >= (this.slotDistance[max - 1] ?? 0)) {
        continue;
      } else {
        slot = max - 1;
      }
      while (slot > 0 && (this.slotDistance[slot - 1] ?? 0) > distance) {
        this.slotDistance[slot] = this.slotDistance[slot - 1] ?? 0;
        this.slotIndex[slot] = this.slotIndex[slot - 1] ?? 0;
        slot -= 1;
      }
      this.slotDistance[slot] = distance;
      this.slotIndex[slot] = i;
    }

    for (let slot = 0; slot < filled; slot += 1) {
      const source = this.sources[this.slotIndex[slot] ?? 0];
      if (!source) continue;
      const o4 = slot * 4;
      const o3 = slot * 3;
      uniforms.lights[o4] = source.x - scrollX;
      uniforms.lights[o4 + 1] = source.y - scrollY;
      uniforms.lights[o4 + 2] = source.radius;
      uniforms.lights[o4 + 3] = this.strength(source, seconds, lightsOn);
      uniforms.lightColors[o3] = source.r;
      uniforms.lightColors[o3 + 1] = source.g;
      uniforms.lightColors[o3 + 2] = source.b;
    }
    uniforms.lightCount = filled;
  }

  destroy(): void {
    this.objects.length = 0;
    this.sources.length = 0;
    this.uniforms.lightCount = 0;
  }

  private strength(source: LightSource, seconds: number, lightsOn: number): number {
    let value = source.intensity;
    if (source.nightOnly) {
      value *= lightsOn;
    } else {
      // Always-on lights (forge, screens) barely register against daylight.
      value *= LIGHTING.daylightScale + (1 - LIGHTING.daylightScale) * lightsOn;
    }
    if (source.blink > 0 && (seconds / source.blink + source.phase) % 1 > 0.5) {
      return 0;
    }
    if (source.flicker > 0) {
      const wave =
        Math.sin(seconds * 13 + source.phase) * 0.6 +
        Math.sin(seconds * 7.3 + source.phase * 2) * 0.4;
      value *= 1 + wave * source.flicker;
    }
    return value + source.boost;
  }

  private applyPipeline(entry: LitObject | undefined): void {
    if (!entry || !entry.object.scene) {
      return;
    }
    const lit = this.lightingEnabled && hasNormalMap(entry.texture);
    const name = lit
      ? entry.wind
        ? PIPELINES.litWind
        : PIPELINES.lit
      : entry.wind
        ? PIPELINES.unlitWind
        : PIPELINES.unlit;
    entry.object.setPipeline(name);
  }
}
