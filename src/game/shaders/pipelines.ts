import * as Phaser from "phaser";
import { LIGHTING, WIND } from "@/game/config/visuals";
import { LIT_FRAGMENT, UNLIT_FRAGMENT, WIND_VERTEX, WORLD_VERTEX } from "./glsl";

/**
 * Per-game uniform store shared by the world pipelines. The scene writes into these typed
 * arrays every frame (no allocation); each pipeline uploads them once per render.
 */
export class WorldUniforms {
  time = 0;
  readonly ambient = new Float32Array([1, 1, 1]);
  /** xy = canvas position (texels, y down), z = radius, w = intensity, per light. */
  readonly lights = new Float32Array(LIGHTING.maxLights * 4);
  readonly lightColors = new Float32Array(LIGHTING.maxLights * 3);
  lightCount = 0;
  windAmplitude: number = WIND.amplitude;
  windSpeed: number = WIND.speed;
  windGust: number = WIND.gust;
}

export const PIPELINES = {
  lit: "VillageLit",
  litWind: "VillageLitWind",
  unlit: "VillageUnlit",
  unlitWind: "VillageUnlitWind",
} as const;

export type WorldPipelineName = (typeof PIPELINES)[keyof typeof PIPELINES];

function setWindUniforms(
  pipeline: Phaser.Renderer.WebGL.WebGLPipeline,
  uniforms: WorldUniforms,
): void {
  pipeline.set1f("uTime", uniforms.time);
  pipeline.set1f("uWindAmp", uniforms.windAmplitude);
  pipeline.set1f("uWindSpeed", uniforms.windSpeed);
  pipeline.set1f("uWindGust", uniforms.windGust);
}

/**
 * Normal-mapped lighting with banded falloff. Phaser's LightPipeline is reused for its
 * normal-map batching, but light data comes from WorldUniforms (pre-culled, no allocations)
 * and is evaluated in canvas space, which stays correct inside post-FX framebuffers.
 */
class VillageLitPipeline extends Phaser.Renderer.WebGL.Pipelines.LightPipeline {
  uniforms: WorldUniforms | null = null;

  constructor(game: Phaser.Game, vertShader: string, name: string) {
    super({ game, name, fragShader: LIT_FRAGMENT, vertShader });
  }

  override onRender(): void {
    (this as { lightsActive: boolean }).lightsActive = true;
    const uniforms = this.uniforms;
    this.set1i("uMainSampler", 0);
    this.set1i("uNormSampler", 1);
    this.set1f("uLightBands", LIGHTING.bands);
    this.set1f("uLightHeight", LIGHTING.lightHeight);
    // Normal maps are authored green-up; the shader works in canvas space (y down).
    this.set1f("uNormalYSign", LIGHTING.normalMapGreenUp ? -1 : 1);
    if (!uniforms) {
      this.set3f("uAmbient", 1, 1, 1);
      this.set1i("uLightCount", 0);
      return;
    }
    this.set3f(
      "uAmbient",
      uniforms.ambient[0] ?? 1,
      uniforms.ambient[1] ?? 1,
      uniforms.ambient[2] ?? 1,
    );
    this.set1i("uLightCount", uniforms.lightCount);
    this.set4fv("uLights", uniforms.lights);
    this.set3fv("uLightColors", uniforms.lightColors);
    setWindUniforms(this, uniforms);
  }
}

/** Phaser's multi-texture batch with the ambient colour applied (fallback without normals). */
class VillageUnlitPipeline extends Phaser.Renderer.WebGL.Pipelines.MultiPipeline {
  uniforms: WorldUniforms | null = null;

  constructor(game: Phaser.Game, vertShader: string, name: string) {
    super({ game, name, fragShader: UNLIT_FRAGMENT, vertShader });
  }

  override onRender(): void {
    const uniforms = this.uniforms;
    if (!uniforms) {
      this.set3f("uAmbient", 1, 1, 1);
      return;
    }
    this.set3f(
      "uAmbient",
      uniforms.ambient[0] ?? 1,
      uniforms.ambient[1] ?? 1,
      uniforms.ambient[2] ?? 1,
    );
    setWindUniforms(this, uniforms);
  }
}

type WorldPipeline = VillageLitPipeline | VillageUnlitPipeline;

function rendererOf(game: Phaser.Game): Phaser.Renderer.WebGL.WebGLRenderer | null {
  return game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer ? game.renderer : null;
}

/** Registers the world pipelines on this game's renderer (once per game). */
export function registerWorldPipelines(game: Phaser.Game): void {
  const renderer = rendererOf(game);
  if (!renderer) {
    return;
  }
  const pipelines = renderer.pipelines;
  const add = (name: WorldPipelineName, create: () => WorldPipeline) => {
    if (!pipelines.has(name)) {
      pipelines.add(name, create());
    }
  };
  add(PIPELINES.lit, () => new VillageLitPipeline(game, WORLD_VERTEX, PIPELINES.lit));
  add(PIPELINES.litWind, () => new VillageLitPipeline(game, WIND_VERTEX, PIPELINES.litWind));
  add(PIPELINES.unlit, () => new VillageUnlitPipeline(game, WORLD_VERTEX, PIPELINES.unlit));
  add(PIPELINES.unlitWind, () => new VillageUnlitPipeline(game, WIND_VERTEX, PIPELINES.unlitWind));
}

/** Points every world pipeline at the scene's uniform store (or detaches them with null). */
export function attachWorldUniforms(game: Phaser.Game, uniforms: WorldUniforms | null): void {
  const renderer = rendererOf(game);
  if (!renderer) {
    return;
  }
  for (const name of Object.values(PIPELINES)) {
    const pipeline = renderer.pipelines.get(name);
    if (pipeline instanceof VillageLitPipeline || pipeline instanceof VillageUnlitPipeline) {
      pipeline.uniforms = uniforms;
    }
  }
}
