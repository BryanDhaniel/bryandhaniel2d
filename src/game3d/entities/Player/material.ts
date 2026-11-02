import * as THREE from "three";
import { CHARACTER } from "@/game3d/config/character";

/** Per-frame inputs of the player's rim and bounce light. */
export interface GlowUniforms {
  /** Rim colour (already scaled and capped) and the screen direction it comes from. */
  uRimColor: { value: THREE.Color };
  uRimDirection: { value: THREE.Vector2 };
  /** One texel of the sprite sheet, for finding the sprite's edges. */
  uRimTexel: { value: THREE.Vector2 };
  /** Warm light bouncing onto the underside of the hoodie from the nearest lamp. */
  uBounceColor: { value: THREE.Color };
  /** Opacity, by ordered dithering: below 1 when the third-person camera is very close. */
  uFade: { value: number };
}

export function createGlowUniforms(): GlowUniforms {
  return {
    uRimColor: { value: new THREE.Color(0, 0, 0) },
    uRimDirection: { value: new THREE.Vector2(-1, 1).normalize() },
    uRimTexel: { value: new THREE.Vector2(1, 1) },
    uBounceColor: { value: new THREE.Color(0, 0, 0) },
    uFade: { value: 1 },
  };
}

const VERTEX_HEAD = "varying float vGlowHeight;\n";
const FRAGMENT_HEAD = `uniform vec3 uRimColor;
uniform vec2 uRimDirection;
uniform vec2 uRimTexel;
uniform vec3 uBounceColor;
uniform float uFade;
varying float vGlowHeight;
const float VILLAGE_BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
`;

// Screen-door fade: a 4x4 ordered dither thins the sprite while it stays opaque (no sorting).
const FADE_CODE = /* glsl */ `
  {
    ivec2 villageCell = ivec2(mod(gl_FragCoord.xy, 4.0));
    if ((VILLAGE_BAYER[villageCell.x + villageCell.y * 4] + 0.5) / 16.0 > uFade) discard;
  }
`;

// Edge pixels (opaque, with a transparent neighbour) facing the light get a capped rim; the
// lower body picks up the lamp bounce.
const FRAGMENT_CODE = /* glsl */ `
#ifdef VILLAGE_GLOW
  {
    float glowLeft = texture2D(map, vMapUv - vec2(uRimTexel.x, 0.0)).a;
    float glowRight = texture2D(map, vMapUv + vec2(uRimTexel.x, 0.0)).a;
    float glowDown = texture2D(map, vMapUv - vec2(0.0, uRimTexel.y)).a;
    float glowUp = texture2D(map, vMapUv + vec2(0.0, uRimTexel.y)).a;
    vec2 outward = vec2(step(glowRight, 0.5) - step(glowLeft, 0.5), step(glowUp, 0.5) - step(glowDown, 0.5));
    float facing = dot(outward, outward) > 0.0 ? max(dot(normalize(outward), uRimDirection), 0.0) : 0.0;
    outgoingLight += uRimColor * facing;
    outgoingLight += diffuseColor.rgb * uBounceColor * (1.0 - smoothstep(0.18, 0.55, vGlowHeight));
  }
#endif
`;

/**
 * Adds the rim and bounce light and the close-camera fade to the player's billboard material,
 * on top of the village patches it already has. `height` is the quad's height, for the bounce
 * gradient.
 */
export function patchPlayerGlow(
  material: THREE.MeshStandardMaterial,
  glow: GlowUniforms,
  height: number,
): void {
  const previous = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey();
  const glowing = CHARACTER.rim.enabled || CHARACTER.bounce.enabled;
  material.defines = { ...(material.defines ?? {}), ...(glowing ? { VILLAGE_GLOW: "" } : {}) };
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, glow);
    shader.vertexShader = `${VERTEX_HEAD}${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\n  vGlowHeight = position.y / ${height.toFixed(3)};`,
    );
    shader.fragmentShader = `${FRAGMENT_HEAD}${shader.fragmentShader}`
      .replace(
        "#include <clipping_planes_fragment>",
        `${FADE_CODE}\n#include <clipping_planes_fragment>`,
      )
      .replace("#include <opaque_fragment>", `${FRAGMENT_CODE}\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${baseKey}:glow`;
}
