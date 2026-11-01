import * as THREE from "three";
import { FOG } from "@/game3d/config/visuals";

/**
 * Height fog for every material that uses three.js fog: the built-in FogExp2 density is
 * applied to the depth beyond FOG.depthStart and thickens toward the ground, so valleys and
 * the water hold mist while rooftops stay clear. Installed once by replacing the fog chunks.
 */
let installed = false;

export function installHeightFog(): void {
  if (installed) {
    return;
  }
  installed = true;
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying float vFogHeight;
#endif
`;
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vec4 fogWorld = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    fogWorld = batchingMatrix * fogWorld;
  #endif
  #ifdef USE_INSTANCING
    fogWorld = instanceMatrix * fogWorld;
  #endif
  vFogHeight = ( modelMatrix * fogWorld ).y;
#endif
`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying float vFogHeight;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`;
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogDistance = max( vFogDepth - ${FOG.depthStart.toFixed(2)}, 0.0 );
    float fogFactor = 1.0 - exp( - fogDensity * fogDistance );
    float fogLift = exp( - max( vFogHeight - ${FOG.heightBase.toFixed(2)}, 0.0 ) * ${FOG.heightFalloff.toFixed(3)} );
    fogFactor = clamp( fogFactor * ( 0.35 + 0.65 * fogLift ) + fogDensity * 6.0 * fogLift, 0.0, 1.0 );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;
}
