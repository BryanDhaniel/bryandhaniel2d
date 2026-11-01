import * as THREE from "three";
import { WATER } from "@/game3d/config/visuals";
import { linearRgb } from "@/game3d/lighting/DayNightCycle";
import type { WorldLayout } from "@/game3d/world/layout";

/**
 * Distance from each water texel to the shore (8 texels per tile), 0 at the bank and 255 at
 * WATER.depthReach tiles out. Drives the depth tint and the shoreline foam. Pure.
 */
export function computeShoreDistance(
  layout: WorldLayout,
  resolution: number = WATER.shoreResolution,
): Uint8Array {
  const { width, height, village } = layout;
  const w = width * resolution;
  const h = height * resolution;
  const big = 1e6;
  const distance = new Float32Array(w * h);
  for (let z = 0; z < h; z += 1) {
    for (let x = 0; x < w; x += 1) {
      const tile = Math.floor(z / resolution) * width + Math.floor(x / resolution);
      const ground = village.ground[tile];
      distance[z * w + x] = ground === "water" || ground === "bridge" ? big : 0;
    }
  }
  const at = (x: number, z: number) =>
    x < 0 || z < 0 || x >= w || z >= h ? 0 : (distance[z * w + x] ?? 0);
  const diagonal = Math.SQRT2;
  for (let z = 0; z < h; z += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = z * w + x;
      const d = distance[i] ?? 0;
      if (d === 0) continue;
      distance[i] = Math.min(
        d,
        at(x - 1, z) + 1,
        at(x, z - 1) + 1,
        at(x - 1, z - 1) + diagonal,
        at(x + 1, z - 1) + diagonal,
      );
    }
  }
  for (let z = h - 1; z >= 0; z -= 1) {
    for (let x = w - 1; x >= 0; x -= 1) {
      const i = z * w + x;
      const d = distance[i] ?? 0;
      if (d === 0) continue;
      distance[i] = Math.min(
        d,
        at(x + 1, z) + 1,
        at(x, z + 1) + 1,
        at(x + 1, z + 1) + diagonal,
        at(x - 1, z + 1) + diagonal,
      );
    }
  }
  const out = new Uint8Array(w * h);
  const reach = WATER.depthReach * resolution;
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Math.round(Math.min(1, (distance[i] ?? 0) / reach) * 255);
  }
  return out;
}

export interface WaterUniforms {
  [name: string]: THREE.IUniform;
  uTime: { value: number };
  uShore: { value: THREE.Texture | null };
  uMapSize: { value: THREE.Vector2 };
  uShallow: { value: THREE.Color };
  uDeep: { value: THREE.Color };
  uFoam: { value: THREE.Color };
  uLight: { value: THREE.Color };
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uSkyTop: { value: THREE.Color };
  uSkyHorizon: { value: THREE.Color };
  uViewDir: { value: THREE.Vector3 };
  uReflection: { value: THREE.Texture | null };
  uReflectionMatrix: { value: THREE.Matrix4 };
  uUseReflection: { value: number };
  uReflectionStrength: { value: number };
  uDaylight: { value: number };
  uRain: { value: number };
  /** Fountain basins: centre x, z and radius (radius 0 = use the shore texture). */
  uBasin: { value: THREE.Vector3 };
}

const VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform mat4 uReflectionMatrix;
varying vec3 vWorld;
varying vec4 vReflectCoord;
void main() {
  vec3 transformed = position;
  vec4 world = modelMatrix * vec4(transformed, 1.0);
  vWorld = world.xyz;
  vReflectCoord = uReflectionMatrix * world;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform sampler2D uShore;
uniform vec2 uMapSize;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uLight;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uViewDir;
uniform sampler2D uReflection;
uniform float uUseReflection;
uniform float uReflectionStrength;
uniform float uDaylight;
uniform float uRain;
uniform vec3 uBasin;
varying vec3 vWorld;
varying vec4 vReflectCoord;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 waveNormal(vec2 p, float t) {
  vec2 d1 = vec2(0.8, 0.6);
  vec2 d2 = vec2(-0.47, 0.88);
  vec2 d3 = vec2(0.24, -0.97);
  vec2 grad = d1 * 3.1 * cos(dot(d1, p) * 3.1 + t * 1.3) * 0.06
    + d2 * 4.7 * cos(dot(d2, p) * 4.7 + t * 1.9) * 0.04
    + d3 * 7.9 * cos(dot(d3, p) * 7.9 + t * 2.6) * 0.025;
  return normalize(vec3(-grad.x, 1.0, -grad.y));
}

void main() {
  // Sample on the 16 px texel grid so ripples and sparkles stay pixel-crisp.
  vec2 cell = (floor(vWorld.xz * 16.0) + 0.5) / 16.0;
  float t = uTime * ${WATER.rippleSpeed.toFixed(2)};
  vec3 n = waveNormal(cell * ${WATER.rippleScale.toFixed(2)}, t);
  // Rain rings.
  vec2 rainCell = floor(cell * 1.5);
  float rainPhase = fract(uTime * 0.9 + hash12(rainCell) * 7.0);
  vec2 rainCentre = (rainCell + vec2(hash12(rainCell + 3.1), hash12(rainCell + 7.7))) / 1.5;
  float ring = abs(length(cell - rainCentre) - rainPhase * 0.45);
  n = normalize(n + vec3(0.0, 0.0, 0.35) * uRain * step(ring, 0.03) * (1.0 - rainPhase));

  float shore = uBasin.z > 0.0
    ? clamp((uBasin.z - length(vWorld.xz - uBasin.xy)) / (uBasin.z * 0.6), 0.0, 1.0)
    : texture2D(uShore, vWorld.xz / uMapSize).r;
  vec3 base = mix(uShallow, uDeep, smoothstep(0.05, 1.0, shore)) * uLight;

  vec3 toCamera = -uViewDir;
  float fresnel = pow(1.0 - clamp(dot(n, toCamera), 0.0, 1.0), 3.0);
  vec3 reflection = mix(uSkyHorizon, uSkyTop, clamp(0.35 + n.y * 0.3 - fresnel * 0.5, 0.0, 1.0));
  if (uUseReflection > 0.5) {
    vec4 coord = vReflectCoord;
    coord.xy += n.xz * ${WATER.distortion.toFixed(3)} * coord.w;
    vec3 mirrored = texture2DProj(uReflection, coord).rgb;
    reflection = mix(reflection, mirrored, 0.85);
  }
  float reflectAmount = mix(0.22, 0.65, fresnel) * uReflectionStrength;
  vec3 color = mix(base, reflection, reflectAmount);

  vec3 halfway = normalize(normalize(uSunDir) + toCamera);
  float specular = pow(max(dot(n, halfway), 0.0), 140.0);
  color += uSunColor * specular * 1.6;
  float sparkle = step(${WATER.sparkle.toFixed(3)}, hash12(cell * 16.0 + floor(uTime * 3.0)));
  color += uSunColor * sparkle * (0.2 + 0.8 * uDaylight) * 0.9;

  float foamBand = 1.0 - smoothstep(0.0, ${WATER.foamWidth.toFixed(2)}, shore);
  float foamWave = step(0.55, fract(shore * 5.0 - uTime * 0.35 + hash12(floor(cell * 4.0)) * 0.3));
  color = mix(color, uFoam * uLight * 1.15, foamBand * (0.55 + 0.45 * foamWave));

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function createWaterMaterial(
  shore: THREE.Texture | null,
  layout: WorldLayout,
): THREE.ShaderMaterial {
  const color = (name: Parameters<typeof linearRgb>[0]) => new THREE.Color(...linearRgb(name));
  const uniforms: WaterUniforms = {
    uTime: { value: 0 },
    uShore: { value: null },
    uMapSize: { value: new THREE.Vector2(layout.width, layout.height) },
    uShallow: { value: color(WATER.shallow) },
    uDeep: { value: color(WATER.deep) },
    uFoam: { value: color(WATER.foam) },
    uLight: { value: new THREE.Color(1, 1, 1) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSkyTop: { value: new THREE.Color(0.3, 0.5, 0.8) },
    uSkyHorizon: { value: new THREE.Color(0.7, 0.8, 0.9) },
    uViewDir: { value: new THREE.Vector3(0, -1, 0) },
    uReflection: { value: null },
    uReflectionMatrix: { value: new THREE.Matrix4() },
    uUseReflection: { value: 0 },
    uReflectionStrength: { value: WATER.reflectionStrength },
    uDaylight: { value: 1 },
    uRain: { value: 0 },
    uBasin: { value: new THREE.Vector3(0, 0, 0) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, uniforms]),
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    fog: true,
  });
  // Textures are assigned after merging: UniformsUtils.merge would clone them.
  const shoreUniform = material.uniforms.uShore;
  if (shoreUniform) shoreUniform.value = shore;
  return material;
}

/** Typed access to a water material's uniforms. */
export function waterUniforms(material: THREE.ShaderMaterial): WaterUniforms {
  return material.uniforms as WaterUniforms;
}
