"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useStore } from "zustand";
import {
  CAMERA,
  LIGHT_STYLES,
  LIGHTS,
  QUALITY_TIERS,
  SUN,
  WEATHER,
  type LightKind,
} from "@/game3d/config/visuals";
import { LAMP_HEAD } from "@/game3d/entities/Props";
import { useRuntime } from "@/game3d/runtime";
import { CascadedShadows } from "./CascadedShadows";
import { linearRgb } from "./DayNightCycle";

const KIND_COLORS = Object.fromEntries(
  (Object.keys(LIGHT_STYLES) as LightKind[]).map((kind) => [
    kind,
    new THREE.Color(...linearRgb(LIGHT_STYLES[kind].color)),
  ]),
) as Record<LightKind, THREE.Color>;

const SIN_PITCH = Math.sin((CAMERA.pitch * Math.PI) / 180);

/**
 * The key light (sun by day, moon by night). Its orthographic shadow frustum is fitted to the
 * visible ground, follows the camera and is snapped to whole shadow-map texels, so shadows
 * stay steady while the camera glides.
 */
function SunRig() {
  const runtime = useRuntime();
  const level = useStore(runtime.store, (state) => state.level);
  const tier = QUALITY_TIERS[level];
  const light = useMemo(() => {
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.target = new THREE.Object3D();
    return sun;
  }, []);
  const scratch = useMemo(
    () => ({
      basis: new THREE.Matrix4(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      focus: new THREE.Vector3(),
      origin: new THREE.Vector3(),
      worldUp: new THREE.Vector3(0, 1, 0),
      half: 0,
    }),
    [],
  );

  useEffect(() => {
    light.castShadow = tier.sunShadows;
    if (tier.sunShadows) {
      light.shadow.mapSize.set(tier.shadowMapSize, tier.shadowMapSize);
      light.shadow.map?.dispose();
      light.shadow.map = null;
      light.shadow.bias = SUN.bias;
      light.shadow.normalBias = SUN.normalBias;
      light.shadow.radius = SUN.radius;
      scratch.half = 0;
    }
  }, [light, tier, scratch]);

  useEffect(
    () => () => {
      light.shadow.map?.dispose();
      light.dispose();
    },
    [light],
  );

  useFrame(({ camera, size }) => {
    const state = runtime.cycle.state;
    const sun = state.sunDirection;
    const dim = 1 - (1 - WEATHER.rain.dim) * runtime.weather.rain;
    light.color.setRGB(state.sunColor[0] ?? 1, state.sunColor[1] ?? 1, state.sunColor[2] ?? 1);
    light.intensity = state.sunIntensity * dim;
    const { dir, right, up, focus, basis, origin, worldUp } = scratch;
    dir.set(sun[0] ?? 0, sun[1] ?? 1, sun[2] ?? 0).normalize();
    focus.set(runtime.camera.focusX, 0, runtime.camera.focusZ);
    if (light.castShadow) {
      light.shadow.bias = runtime.tuning.shadowBias;
      light.shadow.normalBias = runtime.tuning.shadowNormalBias;
      // Fit a square frustum around the visible ground, rounded up so zooming doesn't shimmer.
      // In perspective the near ground matters most: a fixed square around the player.
      let reach = SUN.perspectiveHalf;
      if (camera instanceof THREE.OrthographicCamera) {
        const zoom = camera.zoom || 1;
        reach = 0.5 * Math.hypot(size.width / zoom, size.height / zoom / SIN_PITCH);
      }
      const half = Math.ceil((reach + SUN.frustumPadding) / SUN.frustumStep) * SUN.frustumStep;
      const shadowCamera = light.shadow.camera;
      if (half !== scratch.half) {
        scratch.half = half;
        shadowCamera.left = -half;
        shadowCamera.right = half;
        shadowCamera.top = half;
        shadowCamera.bottom = -half;
        shadowCamera.near = 0.5;
        shadowCamera.far = SUN.distance * 2;
        shadowCamera.updateProjectionMatrix();
      }
      // Snap the focus to the shadow-map texel grid in light space.
      basis.lookAt(origin, dir, worldUp);
      right.setFromMatrixColumn(basis, 0);
      up.setFromMatrixColumn(basis, 1);
      const texel = (half * 2) / light.shadow.mapSize.x;
      const along = focus.dot(dir);
      const r = Math.round(focus.dot(right) / texel) * texel;
      const u = Math.round(focus.dot(up) / texel) * texel;
      focus.copy(right).multiplyScalar(r).addScaledVector(up, u).addScaledVector(dir, along);
    }
    light.target.position.copy(focus);
    light.position.copy(focus).addScaledVector(dir, SUN.distance);
    light.target.updateMatrixWorld();
  });

  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  );
}

function Hemisphere() {
  const runtime = useRuntime();
  const light = useMemo(() => new THREE.HemisphereLight(), []);
  useEffect(() => () => light.dispose(), [light]);
  useFrame(() => {
    const state = runtime.cycle.state;
    light.color.setRGB(state.hemiSky[0] ?? 1, state.hemiSky[1] ?? 1, state.hemiSky[2] ?? 1);
    light.groundColor.setRGB(
      state.hemiGround[0] ?? 0,
      state.hemiGround[1] ?? 0,
      state.hemiGround[2] ?? 0,
    );
    light.intensity = state.hemiIntensity * (1 - 0.25 * runtime.weather.rain);
  });
  return <primitive object={light} />;
}

/**
 * A fixed pool of point lights handed each frame to the light sources nearest the camera
 * (lamps, windows, the forge, monitors). The scene's light count never changes, so shaders
 * never recompile; on High the first slot casts shadows from the lamp nearest the player.
 */
function LightPool() {
  const runtime = useRuntime();
  const level = useStore(runtime.store, (state) => state.level);
  const { lightPool, shadowLights } = QUALITY_TIERS[level];
  const pool = useMemo(
    () =>
      Array.from({ length: lightPool }, (_, index) => {
        const light = new THREE.PointLight(0xffffff, 0, 4, LIGHTS.decay);
        if (index < shadowLights) {
          light.castShadow = true;
          light.shadow.mapSize.set(LIGHTS.shadowMapSize, LIGHTS.shadowMapSize);
          light.shadow.bias = LIGHTS.shadowBias;
          light.shadow.camera.near = 0.1;
        }
        return light;
      }),
    [lightPool, shadowLights],
  );
  const scratch = useMemo(
    () => ({
      strength: new Float32Array(0),
      chosen: new Int16Array(lightPool),
      distance: new Float32Array(lightPool),
    }),
    [lightPool],
  );

  useEffect(
    () => () =>
      pool.forEach((light) => {
        light.shadow.map?.dispose();
        light.dispose();
      }),
    [pool],
  );

  useFrame(() => {
    const sources = runtime.lightSources;
    if (scratch.strength.length !== sources.length)
      scratch.strength = new Float32Array(sources.length);
    const state = runtime.cycle.state;
    const lightsOn = state.lightsOn;
    const time = runtime.reducedMotion ? 0 : runtime.elapsed;
    const fx = runtime.camera.focusX;
    const fz = runtime.camera.focusZ;
    const { chosen, distance, strength } = scratch;
    let count = 0;
    let shadowSource = -1;
    let shadowDistance = Infinity;
    for (let i = 0; i < sources.length; i += 1) {
      const source = sources[i];
      if (!source) continue;
      const style = LIGHT_STYLES[source.kind];
      const level = style.nightOnly
        ? lightsOn
        : LIGHTS.daylightScale + (1 - LIGHTS.daylightScale) * lightsOn;
      const flicker =
        1 +
        (Math.sin(time * 13 + source.seed) * 0.5 + Math.sin(time * 7.3 + source.seed * 2) * 0.5) *
          style.flicker;
      const value = style.intensity * level * flicker;
      strength[i] = value;
      if (value < 0.02) continue;
      const d = Math.hypot(source.x - fx, source.z - fz);
      if (d > LIGHTS.cullDistance) continue;
      if (shadowLights > 0 && (source.kind === "lamp" || source.kind === "lantern")) {
        const toPlayer = Math.hypot(source.x - runtime.player.x, source.z - runtime.player.z);
        if (toPlayer < shadowDistance && value > 0.5) {
          shadowDistance = toPlayer;
          shadowSource = i;
        }
      }
      // Insertion into the sorted list of the nearest sources (fixed size, no allocation).
      let slot = count < chosen.length ? count : chosen.length;
      while (slot > 0 && (distance[slot - 1] ?? 0) > d) {
        if (slot < chosen.length) {
          chosen[slot] = chosen[slot - 1] ?? -1;
          distance[slot] = distance[slot - 1] ?? 0;
        }
        slot -= 1;
      }
      if (slot < chosen.length) {
        chosen[slot] = i;
        distance[slot] = d;
        if (count < chosen.length) count += 1;
      }
    }
    // The shadow-casting slot takes the lamp nearest the player; the rest fill in order.
    let next = 0;
    for (let slot = 0; slot < pool.length; slot += 1) {
      const light = pool[slot];
      if (!light) continue;
      let index = -1;
      if (slot < shadowLights) {
        index = shadowSource;
      } else {
        while (next < count && (chosen[next] ?? -1) === shadowSource) next += 1;
        index = next < count ? (chosen[next] ?? -1) : -1;
        next += 1;
      }
      const source = index >= 0 ? sources[index] : undefined;
      if (!source) {
        light.intensity = 0;
        if (light.castShadow) light.shadow.autoUpdate = false;
        continue;
      }
      const style = LIGHT_STYLES[source.kind];
      light.position.set(source.x, source.y, source.z);
      light.color.copy(KIND_COLORS[source.kind]);
      light.intensity = strength[index] ?? 0;
      light.distance = style.distance;
      if (light.castShadow) light.shadow.autoUpdate = true;
    }
  });

  return (
    <>
      {pool.map((light) => (
        <primitive key={light.uuid} object={light} />
      ))}
    </>
  );
}

const CONE_VERTEX = /* glsl */ `
varying float vHeight;
varying float vFacing;
void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vHeight = clamp(-position.y / 1.9, 0.0, 1.0);
  vec3 viewNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vFacing = abs(viewNormal.z);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const CONE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying float vHeight;
varying float vFacing;
void main() {
  float alpha = uStrength * pow(vFacing, 1.6) * (1.0 - vHeight * 0.75) * smoothstep(0.0, 0.12, vHeight);
  gl_FragColor = vec4(uColor * alpha, 1.0);
}
`;

/** Fake volumetric light cones under the street lamps at night (High). */
function Cones() {
  const runtime = useRuntime();
  const lamps = runtime.layout.lamps;
  const resources = useMemo(() => {
    const geometry = new THREE.ConeGeometry(1, 1.9, 20, 1, true).translate(0, -0.95, 0);
    const material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: KIND_COLORS.lamp.clone() }, uStrength: { value: 0 } },
      vertexShader: CONE_VERTEX,
      fragmentShader: CONE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, lamps.length));
    const matrix = new THREE.Matrix4();
    lamps.forEach((lamp, i) => {
      const y =
        runtime.layout.heights[Math.floor(lamp.z) * runtime.layout.width + Math.floor(lamp.x)] ?? 0;
      mesh.setMatrixAt(i, matrix.makeTranslation(lamp.x, y + LAMP_HEAD - 0.1, lamp.z));
    });
    mesh.count = lamps.length;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    return { geometry, material, mesh };
  }, [lamps, runtime.layout]);
  useEffect(
    () => () => {
      resources.geometry.dispose();
      resources.material.dispose();
      resources.mesh.dispose();
    },
    [resources],
  );
  useFrame(() => {
    const strength =
      WEATHER.coneAlpha * runtime.cycle.state.lightsOn * (1 + runtime.weather.rain * 0.8);
    const uniform = resources.material.uniforms.uStrength;
    if (uniform) uniform.value = strength;
    resources.mesh.visible = strength > 0.002;
  });
  return <primitive object={resources.mesh} />;
}

const SHAFT_VERTEX = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uViewDir;
uniform vec3 uFocus;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec3 offset = instanceMatrix[3].xyz;
  float width = length(instanceMatrix[0].xyz);
  float len = length(instanceMatrix[1].xyz);
  vec3 axis = normalize(uSunDir);
  vec3 side = normalize(cross(axis, uViewDir));
  vec3 base = uFocus + offset + vec3(sin(uTime * 0.05 + offset.x) * 1.5, 0.0, 0.0);
  vec3 world = base + axis * (position.y + 0.5) * len + side * position.x * width;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const SHAFT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying vec2 vUv;
void main() {
  float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
  float along = sin(vUv.y * 3.14159);
  float alpha = uStrength * across * across * along;
  gl_FragColor = vec4(uColor * alpha, 1.0);
}
`;

/** Soft light shafts slanting in from the sun, strongest at golden hour (High). */
function Shafts() {
  const runtime = useRuntime();
  const resources = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uViewDir: { value: new THREE.Vector3(0, -1, 0) },
        uFocus: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uColor: { value: new THREE.Color() },
        uStrength: { value: 0 },
      },
      vertexShader: SHAFT_VERTEX,
      fragmentShader: SHAFT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const count = 7;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 3 + (i % 3) * 2.5;
      matrix.makeScale(0.6 + (i % 2) * 0.5, 9, 1);
      matrix.setPosition(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    return { geometry, material, mesh, view: new THREE.Vector3() };
  }, []);
  useEffect(
    () => () => {
      resources.geometry.dispose();
      resources.material.dispose();
      resources.mesh.dispose();
    },
    [resources],
  );
  useFrame(({ camera }) => {
    const state = runtime.cycle.state;
    const u = resources.material.uniforms;
    const strength = WEATHER.shaftAlpha * state.shafts * (1 - runtime.weather.rain);
    camera.getWorldDirection(resources.view);
    (u.uSunDir?.value as THREE.Vector3).set(
      state.sunDirection[0] ?? 0,
      state.sunDirection[1] ?? 1,
      state.sunDirection[2] ?? 0,
    );
    (u.uViewDir?.value as THREE.Vector3).copy(resources.view);
    (u.uFocus?.value as THREE.Vector3).set(runtime.camera.focusX, 0, runtime.camera.focusZ);
    (u.uColor?.value as THREE.Color).setRGB(
      state.sunColor[0] ?? 1,
      state.sunColor[1] ?? 1,
      state.sunColor[2] ?? 1,
    );
    if (u.uStrength) u.uStrength.value = strength;
    if (u.uTime) u.uTime.value = runtime.reducedMotion ? 0 : runtime.elapsed;
    resources.mesh.visible = strength > 0.002;
  });
  return <primitive object={resources.mesh} />;
}

/** Every light in the village; the extras depend on the quality tier. */
export function Lighting() {
  const runtime = useRuntime();
  const level = useStore(runtime.store, (state) => state.level);
  const mode = useStore(runtime.store, (state) => state.cameraMode);
  const camera = useThree((state) => state.camera);
  const tier = QUALITY_TIERS[level];
  // Third-person on High: cascades take over from the single fitted sun shadow.
  const cascaded =
    tier.cascadedShadows && mode === "thirdPerson" && camera instanceof THREE.PerspectiveCamera;
  return (
    <>
      {cascaded ? <CascadedShadows mapSize={tier.shadowMapSize / 2} /> : <SunRig />}
      <Hemisphere />
      <LightPool />
      {tier.cones ? <Cones /> : null}
      {tier.shafts ? <Shafts /> : null}
    </>
  );
}
