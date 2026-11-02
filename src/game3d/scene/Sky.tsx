"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { FOG } from "@/game3d/config/visuals";
import { useRuntime } from "@/game3d/runtime";
import { VillageFog } from "@/game3d/shaders/fog";

const SKY_VERTEX = /* glsl */ `
varying vec2 vScreen;
void main() {
  vScreen = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform float uStars;
uniform float uTime;
varying vec2 vScreen;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec3 color = mix(uHorizon, uTop, smoothstep(0.05, 0.95, vScreen.y));
  // Pixel stars (3x3 device-pixel blocks) that twinkle at night.
  vec2 cell = floor(gl_FragCoord.xy / 3.0);
  float star = step(0.9965, hash12(cell));
  float twinkle = 0.6 + 0.4 * sin(uTime * 2.0 + hash12(cell + 9.0) * 40.0);
  color += vec3(0.85, 0.9, 1.0) * star * twinkle * uStars * smoothstep(0.25, 0.8, vScreen.y);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * The backdrop behind the diorama (a screen-space gradient with stars at night), the height
 * fog and a soft gradient environment light, all driven by the day/night cycle.
 */
export function Sky() {
  const runtime = useRuntime();
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);

  const backdrop = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uStars: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      depthWrite: false,
      depthTest: false,
    });
    return { geometry, material };
  }, []);

  useEffect(() => {
    const fog = new VillageFog(0x000000, FOG.depthStart, 0.01);
    scene.fog = fog;
    // A soft sky-to-ground gradient as image-based light, scaled by the time of day.
    const envScene = new THREE.Scene();
    const sphere = new THREE.SphereGeometry(1, 24, 12);
    const colors: number[] = [];
    const position = sphere.getAttribute("position");
    const top = new THREE.Color(0.55, 0.7, 0.95);
    const horizon = new THREE.Color(0.95, 0.85, 0.7);
    const ground = new THREE.Color(0.25, 0.3, 0.2);
    const mixed = new THREE.Color();
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      if (y >= 0) mixed.copy(horizon).lerp(top, Math.min(1, y * 1.4));
      else mixed.copy(horizon).lerp(ground, Math.min(1, -y * 3));
      colors.push(mixed.r, mixed.g, mixed.b);
    }
    sphere.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const envMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    envScene.add(new THREE.Mesh(sphere, envMaterial));
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(envScene, 0.04);
    scene.environment = env.texture;
    return () => {
      scene.fog = null;
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
      sphere.dispose();
      envMaterial.dispose();
    };
  }, [scene, gl]);

  useEffect(
    () => () => {
      backdrop.geometry.dispose();
      backdrop.material.dispose();
    },
    [backdrop],
  );

  useFrame(() => {
    const state = runtime.cycle.state;
    const uniforms = backdrop.material.uniforms;
    (uniforms.uTop?.value as THREE.Color).setRGB(
      state.skyTop[0] ?? 0,
      state.skyTop[1] ?? 0,
      state.skyTop[2] ?? 0,
    );
    (uniforms.uHorizon?.value as THREE.Color).setRGB(
      state.skyHorizon[0] ?? 0,
      state.skyHorizon[1] ?? 0,
      state.skyHorizon[2] ?? 0,
    );
    if (uniforms.uStars) uniforms.uStars.value = state.stars;
    if (uniforms.uTime) uniforms.uTime.value = runtime.reducedMotion ? 0 : runtime.elapsed;
    const fog = scene.fog;
    if (fog instanceof VillageFog) {
      fog.color.setRGB(state.fogColor[0] ?? 0, state.fogColor[1] ?? 0, state.fogColor[2] ?? 0);
      // The diorama fogs its far side; third-person fogs the distance so the world never ends.
      const blend = runtime.camera.blend;
      fog.start = FOG.depthStart + (FOG.thirdPersonStart - FOG.depthStart) * blend;
      const thicken = 1 + (FOG.thirdPersonDensity - 1) * blend;
      fog.density = state.fogDensity * thicken * (1 + runtime.weather.rain * 1.5);
    }
    backdrop.material.visible = !runtime.camera.perspective;
    scene.environmentIntensity = state.environment;
    // Low quality tone-maps in the renderer; the post stack applies its own exposure.
    gl.toneMappingExposure = state.exposure;
  });

  return (
    <mesh
      geometry={backdrop.geometry}
      material={backdrop.material}
      frustumCulled={false}
      renderOrder={-1000}
    />
  );
}
