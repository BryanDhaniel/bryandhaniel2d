import { Effect } from "postprocessing";
import * as THREE from "three";
import { LUT_SIZE, POST } from "@/game3d/config/visuals";

const FRAGMENT = /* glsl */ `
uniform float gradeExposure;
uniform highp sampler3D gradeLutA;
uniform highp sampler3D gradeLutB;
uniform float gradeLutMix;
uniform float gradeLutStrength;
uniform float gradeLutSize;
uniform float gradeVignetteOffset;
uniform float gradeVignetteDarkness;

vec3 gradeFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

// ACES filmic (the same fit three.js uses), with the exposure for the time of day.
vec3 gradeAces(vec3 color) {
  const mat3 inputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 outputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= gradeExposure / 0.6;
  color = inputMat * color;
  color = gradeFit(color);
  color = outputMat * color;
  return clamp(color, 0.0, 1.0);
}

vec3 gradeToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 gradeToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 color = gradeAces(inputColor.rgb);
  vec3 display = gradeToSrgb(color);
  vec3 coord = display * ((gradeLutSize - 1.0) / gradeLutSize) + 0.5 / gradeLutSize;
  vec3 graded = mix(texture(gradeLutA, coord).rgb, texture(gradeLutB, coord).rgb, gradeLutMix);
  display = mix(display, graded, gradeLutStrength);
  color = gradeToLinear(display);
  // Vignette: 0 at the centre, 1 in the corners.
  float corner = length((uv - 0.5) * 2.0) * 0.7071;
  float vignette = 1.0 - smoothstep(gradeVignetteOffset, 1.0, corner);
  color *= mix(1.0, vignette, gradeVignetteDarkness);
  outputColor = vec4(color, inputColor.a);
}
`;

/**
 * Exposure, ACES tone mapping, a time-of-day colour grade blended between two 3D LUTs, and a
 * vignette, in one pass. It replaces the renderer's tone mapping whenever post-processing
 * runs, so the grade always sees display-referred colour.
 */
export class GradeEffect extends Effect {
  constructor(lut: THREE.Data3DTexture) {
    super("GradeEffect", FRAGMENT, {
      uniforms: new Map<string, THREE.Uniform>([
        ["gradeExposure", new THREE.Uniform(1)],
        ["gradeLutA", new THREE.Uniform(lut)],
        ["gradeLutB", new THREE.Uniform(lut)],
        ["gradeLutMix", new THREE.Uniform(0)],
        ["gradeLutStrength", new THREE.Uniform(1)],
        ["gradeLutSize", new THREE.Uniform(LUT_SIZE)],
        ["gradeVignetteOffset", new THREE.Uniform(POST.vignetteOffset)],
        ["gradeVignetteDarkness", new THREE.Uniform(POST.vignetteDarkness)],
      ]),
    });
  }

  private set(name: string, value: number | THREE.Texture): void {
    const uniform = this.uniforms.get(name);
    if (uniform) uniform.value = value;
  }

  /** Called every frame (positional arguments, so nothing is allocated). */
  setGrade(
    exposure: number,
    lutA: THREE.Texture,
    lutB: THREE.Texture,
    mix: number,
    strength: number,
    vignette: number,
  ): void {
    this.set("gradeExposure", exposure);
    this.set("gradeLutA", lutA);
    this.set("gradeLutB", lutB);
    this.set("gradeLutMix", mix);
    this.set("gradeLutStrength", strength);
    this.set("gradeVignetteDarkness", vignette);
  }
}
