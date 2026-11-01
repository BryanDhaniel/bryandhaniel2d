"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useStore } from "zustand";
import { hash2 } from "@/game/art/pixels";
import { QUALITY_TIERS, WEATHER, WORLD } from "@/game3d/config/visuals";
import { linearRgb } from "@/game3d/lighting/DayNightCycle";
import { useRuntime, type WorldRuntime } from "@/game3d/runtime";
import { useAssets } from "@/game3d/scene/assets";

/**
 * Weather and ambience, all animated on the GPU from a time uniform (the CPU only writes a
 * few uniforms per frame): rain streaks and splashes, drifting fog banks, fireflies at night,
 * dust and pollen by day, motes in the Library's window light, chimney smoke, forge sparks
 * and the fountain's spray.
 */

const HASH = /* glsl */ `
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
`;

interface Uniforms {
  [name: string]: THREE.IUniform;
}

function shader(
  vertex: string,
  fragment: string,
  uniforms: Uniforms,
  additive: boolean,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

function color(name: Parameters<typeof linearRgb>[0]): THREE.Color {
  return new THREE.Color(...linearRgb(name));
}

/** Point sprites drawn as crisp squares; `size` is in world units. */
function points(
  count: number,
  seeds: (index: number) => [number, number, number],
  phase: (index: number) => number,
): THREE.BufferGeometry {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const [x, y, z] = seeds(i);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    phases[i] = phase(i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  return geometry;
}

const POINT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor * vAlpha, vAlpha);
}
`;

function useDisposable<T extends { dispose: () => void }>(items: readonly T[]): void {
  useEffect(() => () => items.forEach((item) => item.dispose()), [items]);
}

function Rain({ count, splashes }: { count: number; splashes: number }) {
  const runtime = useRuntime();
  const { layout } = runtime;
  const parts = useMemo(() => {
    const { area, height, speed, slant } = WEATHER.rain;
    const streak = new THREE.PlaneGeometry(0.03, 0.55);
    const drops = new THREE.InstancedMesh(
      streak,
      shader(
        /* glsl */ `
        uniform float uTime;
        uniform vec3 uFocus;
        varying float vAlpha;
        varying float vV;
        void main() {
          vec3 seed = instanceMatrix[3].xyz;
          float fall = mod(seed.y - uTime * ${speed.toFixed(1)}, ${height.toFixed(1)});
          vec3 centre = vec3(
            uFocus.x + mod(seed.x - uFocus.x + fall * ${slant.toFixed(2)}, ${area.toFixed(1)}) - ${(area / 2).toFixed(1)},
            fall - 1.0,
            uFocus.z + mod(seed.z - uFocus.z, ${area.toFixed(1)}) - ${(area / 2).toFixed(1)});
          vec4 mv = viewMatrix * vec4(centre, 1.0);
          mv.xy += position.xy;
          vV = position.y / 0.55 + 0.5;
          vAlpha = smoothstep(-1.0, 1.0, fall);
          gl_Position = projectionMatrix * mv;
        }`,
        /* glsl */ `
        uniform vec3 uColor;
        uniform float uLevel;
        varying float vAlpha;
        varying float vV;
        void main() {
          float a = uLevel * 0.42 * vAlpha * vV;
          gl_FragColor = vec4(uColor * a, a);
        }`,
        {
          uTime: { value: 0 },
          uFocus: { value: new THREE.Vector3() },
          uColor: { value: color("foam") },
          uLevel: { value: 0 },
        },
        true,
      ),
      count,
    );
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i += 1) {
      drops.setMatrixAt(
        i,
        matrix.makeTranslation(
          hash2(i, 1, 81) * area,
          hash2(i, 2, 82) * height,
          hash2(i, 3, 83) * area,
        ),
      );
    }
    drops.frustumCulled = false;
    // Splash rings on the ground (heights from a small data texture so the plaza works too).
    const heights = new Uint8Array(layout.width * layout.height);
    layout.heights.forEach((h, i) => {
      const ground = layout.village.ground[i];
      const top = ground === "water" || ground === "bridge" ? WORLD.waterLevel : h;
      heights[i] = Math.round(((top + 1) / 2) * 255);
    });
    const heightMap = new THREE.DataTexture(heights, layout.width, layout.height, THREE.RedFormat);
    heightMap.needsUpdate = true;
    const ring = new THREE.PlaneGeometry(0.36, 0.36).rotateX(-Math.PI / 2);
    const rings = new THREE.InstancedMesh(
      ring,
      shader(
        /* glsl */ `
        ${HASH}
        uniform float uTime;
        uniform vec3 uFocus;
        uniform sampler2D uHeights;
        uniform vec2 uMapSize;
        varying vec2 vUv;
        varying float vPhase;
        void main() {
          float seed = float(gl_InstanceID) * 7.31;
          float cycle = uTime * 1.6 + hash11(seed) * 10.0;
          float round = floor(cycle);
          vPhase = fract(cycle);
          vec2 offset = vec2(hash11(seed + round * 1.7), hash11(seed * 3.1 + round)) * 18.0 - 9.0;
          vec2 xz = uFocus.xz + offset;
          float h = texture2D(uHeights, xz / uMapSize).r * 2.0 - 1.0;
          vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * vec4(vec3(xz.x, h + 0.02, xz.y) + position * (0.4 + vPhase), 1.0);
        }`,
        /* glsl */ `
        uniform vec3 uColor;
        uniform float uLevel;
        varying vec2 vUv;
        varying float vPhase;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float ringMask = step(abs(d - vPhase * 0.9), 0.12);
          float a = uLevel * ringMask * (1.0 - vPhase) * 0.6;
          gl_FragColor = vec4(uColor * a, a);
        }`,
        {
          uTime: { value: 0 },
          uFocus: { value: new THREE.Vector3() },
          uHeights: { value: heightMap },
          uMapSize: { value: new THREE.Vector2(layout.width, layout.height) },
          uColor: { value: color("foam") },
          uLevel: { value: 0 },
        },
        true,
      ),
      Math.max(1, splashes),
    );
    rings.count = splashes;
    rings.frustumCulled = false;
    return {
      drops,
      rings,
      meshes: [drops, rings],
      disposables: [
        streak,
        ring,
        heightMap,
        drops.material as THREE.Material,
        rings.material as THREE.Material,
      ],
    };
  }, [count, splashes, layout]);
  useDisposable(parts.disposables);

  useFrame(() => {
    const level = runtime.weather.rain;
    parts.drops.visible = level > 0.01;
    parts.rings.visible = level > 0.01 && splashes > 0;
    for (const mesh of parts.meshes) {
      const u = (mesh.material as THREE.ShaderMaterial).uniforms;
      if (u.uTime) u.uTime.value = runtime.elapsed;
      if (u.uLevel) u.uLevel.value = level;
      (u.uFocus?.value as THREE.Vector3 | undefined)?.set(
        runtime.camera.focusX,
        0,
        runtime.camera.focusZ,
      );
    }
  });

  return (
    <>
      <primitive object={parts.drops} />
      <primitive object={parts.rings} />
    </>
  );
}

function fogAmount(runtime: WorldRuntime): number {
  const state = runtime.cycle.state;
  return Math.min(
    1,
    Math.max(0, (state.fogDensity - 0.006) / 0.016) +
      runtime.weather.rain * WEATHER.fogBanks.rainBoost,
  );
}

function FogBanks({ count }: { count: number }) {
  const runtime = useRuntime();
  const assets = useAssets();
  const parts = useMemo(() => {
    const quad = new THREE.PlaneGeometry(1, 1);
    const material = shader(
      /* glsl */ `
      uniform float uTime;
      uniform vec3 uFocus;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        vec3 seed = instanceMatrix[3].xyz;
        vSeed = seed.x * 0.37 + seed.z * 0.11;
        vec3 centre = vec3(uFocus.x + mod(seed.x + uTime * ${WEATHER.fogBanks.drift.toFixed(2)}, 24.0) - 12.0, seed.y, uFocus.z + seed.z);
        vec4 mv = viewMatrix * vec4(centre, 1.0);
        mv.xy += position.xy * vec2(7.0, 1.8);
        vUv = uv;
        gl_Position = projectionMatrix * mv;
      }`,
      /* glsl */ `
      uniform sampler2D uNoise;
      uniform vec3 uColor;
      uniform float uAlpha;
      uniform float uTime;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        float n = texture2D(uNoise, vUv * vec2(1.4, 0.5) + vec2(vSeed + uTime * 0.01, vSeed)).r;
        float shape = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.45, vUv.y) * smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
        float a = uAlpha * shape * smoothstep(0.3, 0.75, n);
        gl_FragColor = vec4(uColor, a);
      }`,
      {
        uTime: { value: 0 },
        uFocus: { value: new THREE.Vector3() },
        uNoise: { value: assets.noise },
        uColor: { value: new THREE.Color() },
        uAlpha: { value: 0 },
      },
      false,
    );
    const mesh = new THREE.InstancedMesh(quad, material, count);
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i += 1) {
      mesh.setMatrixAt(
        i,
        matrix.makeTranslation(
          hash2(i, 4, 91) * 24,
          0.5 + hash2(i, 5, 92) * 0.7,
          hash2(i, 6, 93) * 16 - 8,
        ),
      );
    }
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    return { mesh, disposables: [quad, material] };
  }, [count, assets.noise]);
  useDisposable(parts.disposables);
  useFrame(() => {
    const state = runtime.cycle.state;
    const u = (parts.mesh.material as THREE.ShaderMaterial).uniforms;
    const alpha = WEATHER.fogBanks.alpha * fogAmount(runtime);
    if (u.uAlpha) u.uAlpha.value = alpha;
    if (u.uTime) u.uTime.value = runtime.reducedMotion ? 0 : runtime.elapsed;
    (u.uFocus?.value as THREE.Vector3 | undefined)?.set(
      runtime.camera.focusX,
      0,
      runtime.camera.focusZ,
    );
    (u.uColor?.value as THREE.Color | undefined)
      ?.setRGB(state.fogColor[0] ?? 0.5, state.fogColor[1] ?? 0.5, state.fogColor[2] ?? 0.5)
      .multiplyScalar(1.3);
    parts.mesh.visible = alpha > 0.01;
  });
  return <primitive object={parts.mesh} />;
}

/** Shared vertex shader for drifting point sprites around fixed home positions. */
function driftVertex(motion: string, alpha: string): string {
  return /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uLevel;
  attribute float aPhase;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float t = uTime;
    float phase = aPhase;
    ${motion}
    vAlpha = uLevel * (${alpha});
    vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
    gl_PointSize = uSize;
    gl_Position = projectionMatrix * mv;
  }`;
}

interface Drift {
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  object: THREE.Points;
}

function drift(
  geometry: THREE.BufferGeometry,
  motion: string,
  alpha: string,
  tint: THREE.Color,
  additive = true,
): Drift {
  const material = shader(
    driftVertex(motion, alpha),
    POINT_FRAGMENT,
    {
      uTime: { value: 0 },
      uSize: { value: 3 },
      uLevel: { value: 0 },
      uColor: { value: tint },
    },
    additive,
  );
  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;
  return { geometry, material, object };
}

function setDrift(entry: Drift, time: number, size: number, level: number): void {
  const u = entry.material.uniforms;
  if (u.uTime) u.uTime.value = time;
  if (u.uSize) u.uSize.value = size;
  if (u.uLevel) u.uLevel.value = level;
  entry.object.visible = level > 0.01;
}

function Ambience({ weather }: { weather: "off" | "light" | "full" }) {
  const runtime = useRuntime();
  const { layout } = runtime;
  const entries = useMemo(() => {
    const list: { drift: Drift; size: number; level: (rt: WorldRuntime) => number }[] = [];
    const ground = (x: number, z: number) =>
      layout.heights[Math.floor(z) * layout.width + Math.floor(x)] ?? 0;
    if (weather !== "off") {
      const homes = layout.trees.filter((tree) => {
        const tile = Math.floor(tree.z) * layout.width + Math.floor(tree.x);
        return layout.village.obstacles[tile] !== "forest";
      });
      const fireflies = WEATHER.fireflies.count[weather];
      list.push({
        drift: drift(
          points(
            fireflies,
            (i) => {
              const home = homes[i % Math.max(1, homes.length)] ?? { x: 20, z: 15 };
              return [
                home.x + (hash2(i, 7, 1) - 0.5) * 3,
                ground(home.x, home.z) + 0.5,
                home.z + (hash2(i, 8, 1) - 0.5) * 3,
              ];
            },
            (i) => hash2(i, 9, 1) * 40,
          ),
          "p += vec3(sin(t * 0.6 + phase) * 0.7, 0.35 + sin(t * 0.9 + phase * 1.3) * 0.3, cos(t * 0.5 + phase * 0.7) * 0.7);",
          "0.55 + 0.45 * sin(t * 3.0 + phase * 5.0)",
          color("lime").multiplyScalar(2.2),
        ),
        size: 0.09,
        level: (rt) => rt.cycle.state.lightsOn * (1 - rt.weather.rain),
      });
      const dust = WEATHER.dust.count[weather];
      list.push({
        drift: drift(
          points(
            dust,
            (i) => [hash2(i, 10, 1) * 18, 0.3 + hash2(i, 11, 1) * 2.4, hash2(i, 12, 1) * 18],
            (i) => hash2(i, 13, 1) * 30,
          ),
          "p.x = mod(p.x + t * 0.25 + sin(t * 0.4 + phase) * 0.4, 18.0) - 9.0; p.z = mod(p.z + sin(t * 0.3 + phase) * 0.5, 18.0) - 9.0; p.y += sin(t * 0.7 + phase) * 0.25; p.xz += uFocusXZ;",
          "0.35 * (0.5 + 0.5 * sin(t * 1.3 + phase))",
          color("wheat"),
        ),
        size: 0.05,
        level: (rt) => rt.cycle.state.daylight * (1 - rt.weather.rain),
      });
    }
    // Ambient effects shown on every tier.
    const motes = runtime.buildings.flatMap((model) => model.dustSpots);
    if (motes.length > 0) {
      list.push({
        drift: drift(
          points(
            motes.length * 18,
            (i) => {
              const spot = motes[i % motes.length] ?? new THREE.Vector3();
              return [
                spot.x + (hash2(i, 14, 1) - 0.5) * 0.7,
                spot.y + hash2(i, 15, 1) * 1.2,
                spot.z + (hash2(i, 16, 1) - 0.5) * 0.6,
              ];
            },
            (i) => hash2(i, 17, 1) * 20,
          ),
          "p += vec3(sin(t * 0.3 + phase) * 0.15, sin(t * 0.25 + phase * 2.0) * 0.2, cos(t * 0.2 + phase) * 0.1);",
          "0.6 * (0.5 + 0.5 * sin(t * 0.8 + phase))",
          color("gold").multiplyScalar(1.6),
        ),
        size: 0.04,
        level: (rt) => rt.cycle.state.daylight,
      });
    }
    const forge = runtime.buildings.map((model) => model.forge).find((point) => point !== null);
    if (forge) {
      list.push({
        drift: drift(
          points(
            WEATHER.sparks,
            () => [forge.x, forge.y, forge.z],
            (i) => hash2(i, 18, 1),
          ),
          `float life = fract(t * 0.9 + phase * 7.0);
           float seed = floor(t * 0.9 + phase * 7.0) + phase * 13.0;
           vec3 v = vec3(sin(seed * 12.9) * 0.8, 2.2 + fract(seed * 4.3) * 1.4, 0.5 + cos(seed * 7.1) * 0.5);
           p += v * life + vec3(0.0, -2.6 * life * life, 0.0);`,
          "(1.0 - fract(t * 0.9 + phase * 7.0)) * step(0.35, fract(phase * 3.7 + floor(t * 0.9 + phase * 7.0) * 0.618))",
          color("gold").multiplyScalar(3),
        ),
        size: 0.06,
        level: () => 1,
      });
    }
    const fountain = layout.fountain;
    if (fountain) {
      list.push({
        drift: drift(
          points(
            36,
            () => [fountain.x, WORLD.plazaHeight + 1.15, fountain.z],
            (i) => i / 36,
          ),
          `float life = fract(t * 0.8 + phase * 3.0);
           float angle = phase * 6.2831;
           p += vec3(cos(angle) * 0.55 * life, 0.55 * life - 1.0 * life * life, sin(angle) * 0.55 * life);`,
          "0.75 * (1.0 - fract(t * 0.8 + phase * 3.0))",
          color("foam"),
          false,
        ),
        size: 0.05,
        level: () => 1,
      });
    }
    // Dust follows the camera focus.
    for (const entry of list) {
      entry.drift.material.vertexShader = `uniform vec2 uFocusXZ;\n${entry.drift.material.vertexShader}`;
      entry.drift.material.uniforms.uFocusXZ = { value: new THREE.Vector2() };
    }
    return list;
  }, [weather, layout, runtime.buildings]);

  useEffect(
    () => () =>
      entries.forEach((entry) => {
        entry.drift.geometry.dispose();
        entry.drift.material.dispose();
      }),
    [entries],
  );

  useFrame(({ camera, gl }) => {
    // Point sizes are in framebuffer pixels: world size x zoom (CSS px per unit) x pixel ratio.
    const scale = ((camera as THREE.OrthographicCamera).zoom || 1) * gl.getPixelRatio();
    const time = runtime.reducedMotion ? 0 : runtime.elapsed;
    for (const entry of entries) {
      setDrift(
        entry.drift,
        time,
        Math.max(2, Math.round(entry.size * scale)),
        entry.level(runtime),
      );
      (entry.drift.material.uniforms.uFocusXZ?.value as THREE.Vector2 | undefined)?.set(
        runtime.camera.focusX,
        runtime.camera.focusZ,
      );
    }
  });

  return (
    <>
      {entries.map((entry) => (
        <primitive key={entry.drift.object.uuid} object={entry.drift.object} />
      ))}
    </>
  );
}

function Smoke() {
  const runtime = useRuntime();
  const parts = useMemo(() => {
    const chimneys = runtime.buildings.flatMap((model) => model.chimneys);
    const puffs = WEATHER.smokePuffs;
    const quad = new THREE.PlaneGeometry(1, 1);
    const material = shader(
      /* glsl */ `
      uniform float uTime;
      uniform float uWind;
      varying vec2 vUv;
      varying float vLife;
      void main() {
        vec3 origin = instanceMatrix[3].xyz;
        float phase = instanceMatrix[0].x;
        float life = fract(uTime * 0.16 + phase);
        vLife = life;
        vec3 centre = origin + vec3(life * 1.4 * uWind, life * 2.6, life * 0.4 * uWind);
        vec4 mv = viewMatrix * vec4(centre, 1.0);
        mv.xy += position.xy * (0.22 + life * 1.1);
        vUv = uv;
        gl_Position = projectionMatrix * mv;
      }`,
      /* glsl */ `
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vLife;
      void main() {
        vec2 cell = floor(vUv * 8.0) / 8.0 + 0.0625;
        float d = length(cell - 0.5) * 2.0;
        float a = step(d, 0.9) * (1.0 - vLife) * smoothstep(0.0, 0.08, vLife) * 0.22;
        gl_FragColor = vec4(uColor, a);
      }`,
      { uTime: { value: 0 }, uWind: { value: 1 }, uColor: { value: new THREE.Color() } },
      false,
    );
    const mesh = new THREE.InstancedMesh(quad, material, Math.max(1, chimneys.length * puffs));
    const matrix = new THREE.Matrix4();
    chimneys.forEach((chimney, c) => {
      for (let i = 0; i < puffs; i += 1) {
        matrix.makeScale(i / puffs + c * 0.37, 1, 1);
        matrix.setPosition(chimney);
        mesh.setMatrixAt(c * puffs + i, matrix);
      }
    });
    mesh.count = chimneys.length * puffs;
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    return { mesh, disposables: [quad, material] };
  }, [runtime.buildings]);
  useDisposable(parts.disposables);
  useFrame(() => {
    const state = runtime.cycle.state;
    const u = (parts.mesh.material as THREE.ShaderMaterial).uniforms;
    if (u.uTime) u.uTime.value = runtime.elapsed;
    if (u.uWind) u.uWind.value = runtime.reducedMotion ? 0.3 : 1 + runtime.weather.rain;
    const light = Math.max(0.15, state.hemiIntensity * 0.9 + state.sunIntensity * 0.25);
    (u.uColor?.value as THREE.Color | undefined)?.setRGB(0.42 * light, 0.42 * light, 0.45 * light);
  });
  return <primitive object={parts.mesh} />;
}

/** All weather and ambient effects for the current tier and the weather setting. */
export function Weather() {
  const runtime = useRuntime();
  const level = useStore(runtime.store, (state) => state.level);
  const interactive = useStore(runtime.store, (state) => state.interactive);
  const weather = QUALITY_TIERS[level].weather;
  // Buildings register their chimneys and forge on mount; weather assets load after the
  // first interactive frame so they never delay the first picture.
  if (!interactive) return null;
  return (
    <>
      <Smoke />
      <Ambience weather={weather} />
      {weather !== "off" ? (
        <>
          <Rain count={WEATHER.rain.drops[weather]} splashes={WEATHER.rain.splashes[weather]} />
          <FogBanks count={WEATHER.fogBanks.count[weather]} />
        </>
      ) : null}
    </>
  );
}
