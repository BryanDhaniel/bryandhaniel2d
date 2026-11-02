import * as THREE from "three";
import { FOG } from "@/game3d/config/visuals";

/**
 * Height fog for every material that uses three.js fog. The scene uses a VillageFog (a
 * three.js Fog whose `near` is where the fog starts and whose `far` carries the density), so
 * the start can move with the camera mode without recompiling a shader: exponential fog
 * beyond the start, thickening toward the ground, so valleys and the water hold mist while
 * rooftops stay clear. Installed once by replacing the fog chunks.
 */
export class VillageFog extends THREE.Fog {
  constructor(color: THREE.ColorRepresentation, start: number, density: number) {
    super(color, start, density);
  }

  /** Depth from the camera where the fog begins. */
  get start(): number {
    return this.near;
  }

  set start(value: number) {
    this.near = value;
  }

  get density(): number {
    return this.far;
  }

  set density(value: number) {
    this.far = value;
  }
}

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
    float villageFogStart = ${FOG.depthStart.toFixed(2)};
    float villageFogDensity = fogDensity;
  #else
    // VillageFog: near = where it starts, far = density.
    float villageFogStart = fogNear;
    float villageFogDensity = fogFar;
  #endif
    float fogDistance = max( vFogDepth - villageFogStart, 0.0 );
    float fogFactor = 1.0 - exp( - villageFogDensity * fogDistance );
    float fogLift = exp( - max( vFogHeight - ${FOG.heightBase.toFixed(2)}, 0.0 ) * ${FOG.heightFalloff.toFixed(3)} );
    fogFactor = clamp( fogFactor * ( 0.35 + 0.65 * fogLift ) + villageFogDensity * 6.0 * fogLift, 0.0, 1.0 );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;
}
