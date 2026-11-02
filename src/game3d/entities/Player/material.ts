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
}

export function createGlowUniforms(): GlowUniforms {
  return {
    uRimColor: { value: new THREE.Color(0, 0, 0) },
    uRimDirection: { value: new THREE.Vector2(-1, 1).normalize() },
    uRimTexel: { value: new THREE.Vector2(1, 1) },
    uBounceColor: { value: new THREE.Color(0, 0, 0) },
  };
}

const VERTEX_HEAD = "varying float vGlowHeight;\n";
const FRAGMENT_HEAD = `uniform vec3 uRimColor;
uniform vec2 uRimDirection;
uniform vec2 uRimTexel;
uniform vec3 uBounceColor;
varying float vGlowHeight;
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
 * Adds the rim and bounce light to the player's billboard material, on top of the village
 * patches it already has. `height` is the quad's height, for the bounce gradient.
 */
export function patchPlayerGlow(
  material: THREE.MeshStandardMaterial,
  glow: GlowUniforms,
  height: number,
): void {
  if (!CHARACTER.rim.enabled && !CHARACTER.bounce.enabled) return;
  const previous = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey();
  material.defines = { ...(material.defines ?? {}), VILLAGE_GLOW: "" };
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, glow);
    shader.vertexShader = `${VERTEX_HEAD}${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\n  vGlowHeight = position.y / ${height.toFixed(3)};`,
    );
    shader.fragmentShader = `${FRAGMENT_HEAD}${shader.fragmentShader}`.replace(
      "#include <opaque_fragment>",
      `${FRAGMENT_CODE}\n#include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => `${baseKey}:glow`;
}
