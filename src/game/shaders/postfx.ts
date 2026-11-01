import * as Phaser from "phaser";
import { POST, RETRO, WATER } from "@/game/config/visuals";
import {
  BLUR_FRAGMENT,
  BRIGHT_FRAGMENT,
  COMPOSITE_FRAGMENT,
  RETRO_FRAGMENT,
  WATER_FRAGMENT,
} from "./glsl";

export const POST_FX = {
  village: "VillagePostFX",
  retro: "RetroPostFX",
} as const;

/** Values the world scene updates each frame; the post pipeline reads them when it draws. */
export class PostSettings {
  time = 0;
  scrollX = 0;
  scrollY = 0;
  /** Water ripples/sparkles; reflections and puddles are separate strengths (0 = off). */
  water = false;
  reflections = 0;
  puddles = 0;
  daylight = 1;
  readonly skyTint = new Float32Array([1, 1, 1]);
  readonly sparkColor = new Float32Array([1, 1, 1]);
  bloomStrength: number = POST.bloomStrength;
  readonly gradeTint = new Float32Array([1, 1, 1]);
  gradeStrength = 0;
  saturation = 1;
  contrast = 1;
  brightness = 1;
  vignette: number = POST.vignetteStrength;
}

export interface WaterMaskTexture {
  texture: WebGLTexture;
  width: number;
  height: number;
}

const SHADER = { water: 0, bright: 1, blur: 2, composite: 3 } as const;

/**
 * Water (ripples, sparkles, reflections, puddles) -> threshold bloom -> colour grade and
 * vignette, all at the low base resolution so nothing blurs the pixel grid once upscaled.
 */
export class VillagePostFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  settings: PostSettings | null = null;
  mask: WaterMaskTexture | null = null;

  constructor(game: Phaser.Game) {
    super({
      game,
      name: POST_FX.village,
      shaders: [
        { name: "water", fragShader: WATER_FRAGMENT },
        { name: "bright", fragShader: BRIGHT_FRAGMENT },
        { name: "blur", fragShader: BLUR_FRAGMENT },
        { name: "composite", fragShader: COMPOSITE_FRAGMENT },
      ],
    });
  }

  override onDraw(renderTarget: Phaser.Renderer.WebGL.RenderTarget): void {
    const settings = this.settings;
    const water = this.shaders[SHADER.water];
    const bright = this.shaders[SHADER.bright];
    const blur = this.shaders[SHADER.blur];
    const composite = this.shaders[SHADER.composite];
    if (!settings || !water || !bright || !blur || !composite) {
      this.bindAndDraw(renderTarget);
      return;
    }
    const gl = this.gl;
    const width = this.renderer.width;
    const height = this.renderer.height;
    let scene = renderTarget;

    if (settings.water && this.mask) {
      this.set1i("uMaskSampler", 1, water);
      this.set2f("uResolution", width, height, water);
      this.set2f("uScroll", settings.scrollX, settings.scrollY, water);
      this.set2f("uWorldSize", this.mask.width, this.mask.height, water);
      this.set1f("uTime", settings.time, water);
      this.set1f("uReflect", settings.reflections, water);
      this.set1f("uReach", WATER.reflectionReach, water);
      this.set1f("uWobble", WATER.wobble, water);
      this.set1f("uRipple", WATER.rippleSpeed, water);
      this.set1f("uSparkle", WATER.sparkle, water);
      this.set1f("uPuddles", settings.puddles, water);
      this.set1f("uDaylight", settings.daylight, water);
      this.set3fv("uSkyTint", settings.skyTint, water);
      this.set3fv("uSparkColor", settings.sparkColor, water);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.mask.texture);
      gl.activeTexture(gl.TEXTURE0);
      this.bindAndDraw(renderTarget, this.fullFrame1, true, true, water);
      scene = this.fullFrame1;
    }

    // Bloom: keep bright pixels at half resolution, blur, then add back in the composite.
    this.set1f("uThreshold", POST.bloomThreshold, bright);
    this.set1f("uKnee", POST.bloomKnee, bright);
    this.bindAndDraw(scene, this.halfFrame1, true, true, bright);
    const radius = POST.bloomRadius;
    this.set2f("uDirection", radius / this.halfFrame1.width, 0, blur);
    this.bindAndDraw(this.halfFrame1, this.halfFrame2, true, true, blur);
    this.set2f("uDirection", 0, radius / this.halfFrame2.height, blur);
    this.bindAndDraw(this.halfFrame2, this.halfFrame1, true, true, blur);

    this.set1i("uBloomSampler", 1, composite);
    this.set2f("uResolution", width, height, composite);
    this.set1f("uBloomStrength", settings.bloomStrength, composite);
    this.set3fv("uGradeTint", settings.gradeTint, composite);
    this.set1f("uGradeStrength", settings.gradeStrength, composite);
    this.set1f("uSaturation", settings.saturation, composite);
    this.set1f("uContrast", settings.contrast, composite);
    this.set1f("uBrightness", settings.brightness, composite);
    this.set1f("uVignette", settings.vignette, composite);
    this.set1f("uVignetteLevels", POST.vignetteLevels, composite);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.halfFrame1.texture?.webGLTexture ?? null);
    gl.activeTexture(gl.TEXTURE0);
    this.bindAndDraw(scene, undefined, true, true, composite);

    // Leave unit 1 clean for the next pipeline's own bindings.
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
  }
}

export class RetroSettings {
  time = 0;
}

/** Optional CRT / film-grain pass (off by default). */
export class RetroPostFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  settings: RetroSettings | null = null;

  constructor(game: Phaser.Game) {
    super({ game, name: POST_FX.retro, fragShader: RETRO_FRAGMENT });
  }

  override onDraw(renderTarget: Phaser.Renderer.WebGL.RenderTarget): void {
    this.set2f("uResolution", this.renderer.width, this.renderer.height);
    this.set1f("uTime", this.settings?.time ?? 0);
    this.set1f("uGrain", RETRO.grain);
    this.set1f("uScanlines", RETRO.scanlines);
    this.set1f("uAberration", RETRO.aberration);
    this.set1f("uRoll", RETRO.roll);
    this.bindAndDraw(renderTarget);
  }
}

/** Makes the post pipelines available to cameras of this game. */
export function registerPostPipelines(game: Phaser.Game): void {
  const renderer = game.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) {
    return;
  }
  renderer.pipelines.addPostPipeline(POST_FX.village, VillagePostFX);
  renderer.pipelines.addPostPipeline(POST_FX.retro, RetroPostFX);
}
