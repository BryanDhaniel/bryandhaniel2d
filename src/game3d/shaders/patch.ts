import * as THREE from "three";
import { CLOUDS, SPRITES, WIND } from "@/game3d/config/visuals";

/**
 * Uniforms shared by every patched world material. One set per mounted world; the frame loop
 * writes them once per frame and every material sees the new values.
 */
export interface WorldUniforms {
  uTime: { value: number };
  uCloudMap: { value: THREE.Texture | null };
  uCloudOffset: { value: THREE.Vector2 };
  uCloudScale: { value: number };
  uCloudStrength: { value: number };
  /** Amplitude, speed and gust strength of the wind. */
  uWind: { value: THREE.Vector3 };
  uWetness: { value: number };
}

export function createWorldUniforms(): WorldUniforms {
  return {
    uTime: { value: 0 },
    uCloudMap: { value: null },
    uCloudOffset: { value: new THREE.Vector2() },
    uCloudScale: { value: 1 / CLOUDS.scale },
    uCloudStrength: { value: 0 },
    uWind: { value: new THREE.Vector3(WIND.amplitude, WIND.speed, WIND.gust) },
    uWetness: { value: 0 },
  };
}

export type WindKind = "foliage" | "grass" | "banner";

/** Height (local units) at which each kind of geometry sways fully. */
const WIND_HEIGHT: Record<WindKind, number> = { foliage: 2.6, grass: 0.45, banner: 0.9 };
const WIND_SCALE: Record<WindKind, number> = { foliage: 1, grass: 1.6, banner: 2.2 };

export interface PatchOptions {
  wind?: WindKind;
  /** Drifting cloud shadows on direct light. */
  clouds?: boolean;
  /** Rain makes upward faces darker and glossier. */
  wet?: boolean;
  /** Camera-facing sprites: light them with a fixed upward-tilted normal. */
  billboard?: boolean;
}

const VERTEX_HEAD = /* glsl */ `
uniform float uTime;
uniform vec3 uWind;
varying vec2 vVillageXZ;
varying float vVillageUp;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform sampler2D uCloudMap;
uniform vec2 uCloudOffset;
uniform float uCloudScale;
uniform float uCloudStrength;
uniform float uWetness;
varying vec2 vVillageXZ;
varying float vVillageUp;
`;

const WIND_CODE = /* glsl */ `
#ifdef VILLAGE_WIND
  vec3 windBase = modelMatrix[3].xyz;
  #ifdef USE_INSTANCING
    windBase += instanceMatrix[3].xyz;
  #endif
  float windPhase = dot(windBase.xz, vec2(0.71, 1.13));
  float windWeight = clamp(position.y / WIND_HEIGHT, 0.0, 1.0);
  windWeight *= windWeight;
  float windT = uTime * uWind.y + windPhase;
  float windSway = sin(windT) + sin(windT * 2.3 + 1.7) * uWind.z;
  transformed.x += windSway * uWind.x * windWeight * WIND_SCALE;
  transformed.z += cos(windT * 0.8) * uWind.x * 0.4 * windWeight * WIND_SCALE;
#endif
`;

const WORLD_CODE = /* glsl */ `
  vec4 villageWorld = vec4(transformed, 1.0);
  vec3 villageNormal = objectNormal;
  #ifdef USE_INSTANCING
    villageWorld = instanceMatrix * villageWorld;
    villageNormal = mat3(instanceMatrix) * villageNormal;
  #endif
  villageWorld = modelMatrix * villageWorld;
  vVillageXZ = villageWorld.xz;
  vVillageUp = normalize(mat3(modelMatrix) * villageNormal).y;
`;

const CLOUD_CODE = /* glsl */ `
#ifdef VILLAGE_CLOUDS
  // Snap to the 16 px texel grid so cloud edges stay pixel-crisp.
  vec2 cloudXZ = floor(vVillageXZ * 16.0) / 16.0;
  float cloudNoise = texture2D(uCloudMap, cloudXZ * uCloudScale + uCloudOffset).r;
  float cloudShade = 1.0 - uCloudStrength * smoothstep(0.45, 0.66, cloudNoise);
  reflectedLight.directDiffuse *= cloudShade;
  reflectedLight.directSpecular *= cloudShade;
#endif
`;

const WET_ROUGHNESS = /* glsl */ `
#ifdef VILLAGE_WET
  float villageWet = uWetness * smoothstep(0.3, 0.9, vVillageUp);
  roughnessFactor = mix(roughnessFactor, 0.22, villageWet);
#endif
`;

const WET_COLOR = /* glsl */ `
#ifdef VILLAGE_WET
  diffuseColor.rgb *= 1.0 - 0.25 * uWetness * smoothstep(0.3, 0.9, vVillageUp);
#endif
`;

const BILLBOARD_NORMAL = /* glsl */ `
#ifdef VILLAGE_BILLBOARD
  objectNormal = normalize(vec3(${SPRITES.normal[0].toFixed(3)}, ${SPRITES.normal[1].toFixed(3)}, ${SPRITES.normal[2].toFixed(3)}));
#endif
`;

function inject(source: string, anchor: string, code: string, before = false): string {
  if (!source.includes(anchor)) {
    throw new Error(`Shader anchor ${anchor} not found.`);
  }
  return source.replace(anchor, before ? `${code}\n${anchor}` : `${anchor}\n${code}`);
}

/**
 * Adds the village's shared effects to a built-in lit material: wind sway (per-instance
 * phase), cloud shadows on direct light, rain wetness and billboard lighting. Uses
 * onBeforeCompile, so the material keeps every built-in feature (shadows, fog, lights).
 */
export function patchMaterial<T extends THREE.MeshStandardMaterial | THREE.MeshLambertMaterial>(
  material: T,
  uniforms: WorldUniforms,
  options: PatchOptions,
): T {
  const defines: Record<string, unknown> = { ...(material.defines ?? {}) };
  if (options.wind) {
    defines.VILLAGE_WIND = "";
    defines.WIND_HEIGHT = WIND_HEIGHT[options.wind].toFixed(2);
    defines.WIND_SCALE = WIND_SCALE[options.wind].toFixed(2);
  }
  if (options.clouds) defines.VILLAGE_CLOUDS = "";
  if (options.wet) defines.VILLAGE_WET = "";
  if (options.billboard) defines.VILLAGE_BILLBOARD = "";
  material.defines = defines;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    let vertex = `${VERTEX_HEAD}\n${shader.vertexShader}`;
    vertex = inject(vertex, "#include <beginnormal_vertex>", BILLBOARD_NORMAL);
    vertex = inject(vertex, "#include <begin_vertex>", WIND_CODE);
    vertex = inject(vertex, "#include <project_vertex>", WORLD_CODE);
    shader.vertexShader = vertex;
    let fragment = `${FRAGMENT_HEAD}\n${shader.fragmentShader}`;
    fragment = inject(fragment, "#include <color_fragment>", WET_COLOR);
    if (fragment.includes("#include <roughnessmap_fragment>")) {
      fragment = inject(fragment, "#include <roughnessmap_fragment>", WET_ROUGHNESS);
    }
    fragment = inject(fragment, "#include <lights_fragment_end>", CLOUD_CODE);
    shader.fragmentShader = fragment;
  };
  const key = `village:${options.wind ?? "-"}:${options.clouds ? 1 : 0}:${options.wet ? 1 : 0}:${options.billboard ? 1 : 0}`;
  material.customProgramCacheKey = () => key;
  return material;
}
