"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { CLOUDS, SKY_DOME } from "@/game3d/config/visuals";
import { useRuntime } from "@/game3d/runtime";

const DOME_VERTEX = /* glsl */ `
uniform float uRadius;
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 clip = projectionMatrix * viewMatrix * vec4(cameraPosition + position * uRadius, 1.0);
  // Pin it to the far plane so it is always behind the world.
  gl_Position = clip.xyww;
  gl_Position.z *= 0.99999;
}
`;

const DOME_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uFog;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uDaylight;
uniform float uStars;
uniform float uTime;
uniform float uClouds;
uniform float uHaze;
uniform sampler2D uCloudMap;
uniform vec2 uCloudOffset;
uniform float uCloudScale;
uniform float uCloudHeight;
varying vec3 vDir;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 dir = normalize(vDir);
  float up = dir.y;
  vec3 color = mix(uHorizon, uTop, smoothstep(0.0, 0.6, up));
  // Below the horizon (rarely seen behind the hills): fall to the haze colour.
  color = mix(color, uFog, smoothstep(0.0, -0.12, up));

  // The key light: a sun disc with a soft glow by day, a pale moon by night.
  vec3 key = normalize(uSunDir);
  float facing = dot(dir, key);
  float glow = pow(max(facing, 0.0), 32.0) * 0.4 + pow(max(facing, 0.0), 5.0) * 0.12;
  color += uSunColor * glow * uDaylight;
  float sun = smoothstep(0.99935, 0.99965, facing);
  color = mix(color, uSunColor * 4.0 + vec3(0.6), sun * uDaylight);
  float moon = smoothstep(0.99905, 0.99935, facing) * (1.0 - uDaylight);
  // A crescent: the disc minus a shifted disc.
  float shade = smoothstep(0.99905, 0.99935, dot(dir, normalize(key + vec3(0.012, 0.004, 0.0))));
  color = mix(color, vec3(0.93, 0.95, 1.0) * 1.6, moon * (1.0 - shade * 0.82));

  // Pixel stars that twinkle, above the haze.
  vec2 cell = floor(vec2(atan(dir.z, dir.x), asin(clamp(up, -1.0, 1.0))) * 180.0);
  float star = step(0.9972, hash12(cell));
  float twinkle = 0.6 + 0.4 * sin(uTime * 2.0 + hash12(cell + 9.0) * 40.0);
  color += vec3(0.85, 0.9, 1.0) * star * twinkle * uStars * smoothstep(0.08, 0.35, up);

  // Clouds: the same drifting noise that shades the ground, seen on a layer high above.
  if (up > 0.015) {
    vec2 at = cameraPosition.xz + dir.xz * (uCloudHeight - cameraPosition.y) / up;
    float noise = texture2D(uCloudMap, at * uCloudScale + uCloudOffset).r;
    float cover = smoothstep(0.45, 0.66, noise) * uClouds * smoothstep(0.015, 0.22, up);
    vec3 lit = mix(uHorizon, vec3(1.0), 0.55) * (0.35 + 0.65 * uDaylight) + uSunColor * 0.12 * uDaylight;
    color = mix(color, lit, cover * 0.9);
  }

  // A soft haze band along the horizon, tinted like the fog.
  color = mix(color, uFog, uHaze * (1.0 - smoothstep(0.0, 0.22, abs(up))));
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * The sky for the third-person view: a dome around the camera with the day/night gradient, a
 * sun disc (or a crescent moon at night) in the key light's direction, twinkling stars, the
 * drifting clouds that cast the ground's cloud shadows, and haze along the horizon. The
 * isometric view keeps its flat backdrop (Sky.tsx).
 */
export function SkyDome() {
  const runtime = useRuntime();
  const dome = useMemo(() => {
    const geometry = new THREE.SphereGeometry(1, 32, 16);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uRadius: { value: SKY_DOME.radius },
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uFog: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color() },
        uDaylight: { value: 1 },
        uStars: { value: 0 },
        uTime: { value: 0 },
        uClouds: { value: 0 },
        uHaze: { value: SKY_DOME.haze },
        uCloudMap: runtime.uniforms.uCloudMap,
        uCloudOffset: runtime.uniforms.uCloudOffset,
        uCloudScale: runtime.uniforms.uCloudScale,
        uCloudHeight: { value: SKY_DOME.cloudHeight },
      },
      vertexShader: DOME_VERTEX,
      fragmentShader: DOME_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1000;
    mesh.visible = false;
    return { geometry, material, mesh };
  }, [runtime.uniforms]);

  useEffect(
    () => () => {
      dome.geometry.dispose();
      dome.material.dispose();
    },
    [dome],
  );

  useFrame(() => {
    dome.mesh.visible = runtime.camera.perspective;
    if (!dome.mesh.visible) return;
    const state = runtime.cycle.state;
    const u = dome.material.uniforms;
    (u.uTop?.value as THREE.Color).setRGB(
      state.skyTop[0] ?? 0,
      state.skyTop[1] ?? 0,
      state.skyTop[2] ?? 0,
    );
    (u.uHorizon?.value as THREE.Color).setRGB(
      state.skyHorizon[0] ?? 0,
      state.skyHorizon[1] ?? 0,
      state.skyHorizon[2] ?? 0,
    );
    (u.uFog?.value as THREE.Color).setRGB(
      state.fogColor[0] ?? 0,
      state.fogColor[1] ?? 0,
      state.fogColor[2] ?? 0,
    );
    (u.uSunDir?.value as THREE.Vector3).set(
      state.sunDirection[0] ?? 0,
      state.sunDirection[1] ?? 1,
      state.sunDirection[2] ?? 0,
    );
    (u.uSunColor?.value as THREE.Color).setRGB(
      state.sunColor[0] ?? 1,
      state.sunColor[1] ?? 1,
      state.sunColor[2] ?? 1,
    );
    if (u.uDaylight) u.uDaylight.value = state.daylight;
    if (u.uStars) u.uStars.value = state.stars;
    if (u.uTime) u.uTime.value = runtime.reducedMotion ? 0 : runtime.elapsed;
    if (u.uClouds)
      u.uClouds.value =
        Math.min(1, state.clouds * 1.4 + runtime.weather.rain * 0.8 + 0.12) *
        (CLOUDS.strength > 0 ? 1 : 0);
  });

  return <primitive object={dome.mesh} />;
}
