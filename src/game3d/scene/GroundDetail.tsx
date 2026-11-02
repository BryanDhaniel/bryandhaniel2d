"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useStore } from "zustand";
import { hash2 } from "@/game/art/pixels";
import { PALETTE } from "@/game/palette";
import { GROUND_DETAIL } from "@/game3d/config/visuals";
import { crossedQuads, tuftTexture } from "@/game3d/entities/Props";
import { useRuntime } from "@/game3d/runtime";
import { patchMaterial } from "@/game3d/shaders/patch";
import { pixelCanvas, pixelTexture } from "@/game3d/textures/canvas";
import { groundHeight, type WorldLayout } from "@/game3d/world/layout";

/** Ground kinds dense grass may grow on. */
function grassy(layout: WorldLayout, x: number, z: number): boolean {
  const tx = Math.floor(x);
  const tz = Math.floor(z);
  if (tx < 0 || tz < 0 || tx >= layout.width || tz >= layout.height) return false;
  const index = tz * layout.width + tx;
  const ground = layout.village.ground[index];
  return (
    (ground === "grass" || ground === "flowers") &&
    !layout.village.obstacles[index] &&
    layout.walkable[index] === 1
  );
}

/** Small pebbles on a transparent 8x8 canvas (for the path edges). */
function pebbleTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = pixelCanvas(8, 8);
  const stones: readonly [number, number, number, number, string][] = [
    [1, 2, 2, 1, PALETTE.stone],
    [4, 1, 2, 2, PALETTE.mist],
    [2, 5, 3, 2, PALETTE.stone],
    [6, 4, 1, 1, PALETTE.wheat],
  ];
  for (const [x, y, w, h, color] of stones) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }
  return pixelTexture(canvas);
}

const PARTICLE_VERTEX = /* glsl */ `
attribute float alpha;
attribute vec3 tint;
uniform float uScale;
varying float vAlpha;
varying vec3 vTint;
void main() {
  vAlpha = alpha;
  vTint = tint;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * view;
  // Perspective: shrink with distance; orthographic: a fixed size on screen.
  float depth = projectionMatrix[3][3] > 0.5 ? 1.0 : -view.z;
  gl_PointSize = uScale * projectionMatrix[1][1] / depth;
}
`;

const PARTICLE_FRAGMENT = /* glsl */ `
varying float vAlpha;
varying vec3 vTint;
void main() {
  if (vAlpha < 0.02) discard;
  gl_FragColor = vec4(vTint, vAlpha);
  #include <colorspace_fragment>
}
`;

interface Particle {
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/**
 * Close-up ground detail for the third-person view: thick grass and flowers around the
 * player (an instanced pool re-planted as you walk, shrinking away with distance), pebbles
 * along the path edges, puddles that fill as it rains, and a puff of dust, a splash or a few
 * grass bits at each footstep depending on what you step on.
 */
export function GroundDetail() {
  const runtime = useRuntime();
  const level = useStore(runtime.store, (state) => state.level);
  const { layout } = runtime;
  const pool = GROUND_DETAIL.grass[level];

  const detail = useMemo(() => {
    // Dense grass: a fixed pool, re-planted around the player when they cross a tile.
    const grassTexture = tuftTexture(false);
    const flowerTexture = tuftTexture(true);
    const tuftGeometry = crossedQuads(0.36, 0.42);
    const grassMaterials = [grassTexture, flowerTexture].map((texture) =>
      patchMaterial(
        new THREE.MeshStandardMaterial({
          map: texture,
          alphaTest: 0.5,
          side: THREE.DoubleSide,
          roughness: 1,
        }),
        runtime.uniforms,
        { wind: "grass", clouds: true },
      ),
    );
    const grass = grassMaterials.map((material) => {
      const mesh = new THREE.InstancedMesh(tuftGeometry, material, Math.max(1, pool));
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.visible = false;
      return mesh;
    });

    // Path edges: pebbles where a path meets grass.
    const pebbles = pebbleTexture();
    const pebbleMaterial = new THREE.MeshStandardMaterial({
      map: pebbles,
      alphaTest: 0.5,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const flat = new THREE.PlaneGeometry(0.3, 0.3).rotateX(-Math.PI / 2);
    const edges: THREE.Matrix4[] = [];
    const sides = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;
    for (let tz = 0; tz < layout.height; tz += 1) {
      for (let tx = 0; tx < layout.width; tx += 1) {
        if (layout.village.ground[tz * layout.width + tx] !== "path") continue;
        for (const [dx, dz] of sides) {
          if (!grassy(layout, tx + dx + 0.5, tz + dz + 0.5)) continue;
          for (let k = 0; k < 2; k += 1) {
            const along = 0.2 + hash2(tx * 4 + k, tz * 4 + dx * 2 + dz, 51) * 0.6;
            const inset = 0.12 + hash2(tx, tz * 3 + k, 52) * 0.1;
            const x = tx + (dx === 0 ? along : dx > 0 ? 1 - inset : inset);
            const z = tz + (dz === 0 ? along : dz > 0 ? 1 - inset : inset);
            edges.push(
              new THREE.Matrix4().compose(
                new THREE.Vector3(x, groundHeight(layout, x, z) + 0.012, z),
                new THREE.Quaternion().setFromAxisAngle(
                  new THREE.Vector3(0, 1, 0),
                  hash2(tx, tz, 53 + k) * 6.28,
                ),
                new THREE.Vector3(1, 1, 1),
              ),
            );
          }
        }
      }
    }
    const edgeMesh = new THREE.InstancedMesh(flat, pebbleMaterial, Math.max(1, edges.length));
    edges.forEach((matrix, i) => edgeMesh.setMatrixAt(i, matrix));
    edgeMesh.count = edges.length;
    edgeMesh.receiveShadow = true;
    edgeMesh.computeBoundingSphere();

    // Puddles on paths and the plaza, filling with the rain.
    const puddleMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.deep).lerp(new THREE.Color(PALETTE.sky), 0.25),
      roughness: 0.04,
      metalness: 0.3,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const puddleGeometry = new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2);
    const spots: THREE.Matrix4[] = [];
    for (
      let i = 0;
      i < layout.width * layout.height && spots.length < GROUND_DETAIL.puddles;
      i += 7
    ) {
      const ground = layout.village.ground[i];
      if ((ground !== "path" && ground !== "cobble") || hash2(i, 9, 54) > 0.32) continue;
      const x = (i % layout.width) + 0.5;
      const z = Math.floor(i / layout.width) + 0.5;
      spots.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(x, groundHeight(layout, x, z) + 0.008, z),
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            hash2(i, 1, 55) * 6.28,
          ),
          new THREE.Vector3(0.6 + hash2(i, 2, 56) * 0.7, 1, 0.45 + hash2(i, 3, 57) * 0.5),
        ),
      );
    }
    const puddles = new THREE.InstancedMesh(
      puddleGeometry,
      puddleMaterial,
      Math.max(1, spots.length),
    );
    spots.forEach((matrix, i) => puddles.setMatrixAt(i, matrix));
    puddles.count = spots.length;
    puddles.visible = false;
    puddles.computeBoundingSphere();

    // Footstep particles.
    const count = GROUND_DETAIL.particles;
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(count * 3), 3),
    );
    particleGeometry.setAttribute("alpha", new THREE.BufferAttribute(new Float32Array(count), 1));
    particleGeometry.setAttribute(
      "tint",
      new THREE.BufferAttribute(new Float32Array(count * 3), 3),
    );
    const particleMaterial = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: GROUND_DETAIL.particleSize } },
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    particles.frustumCulled = false;
    const live: Particle[] = Array.from({ length: count }, () => ({
      life: 0,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
    }));

    const group = new THREE.Group();
    group.add(...grass, edgeMesh, puddles, particles);
    return {
      group,
      grass,
      grassMaterials,
      grassTextures: [grassTexture, flowerTexture],
      tuftGeometry,
      edgeMesh,
      flat,
      pebbles,
      pebbleMaterial,
      puddles,
      puddleGeometry,
      puddleMaterial,
      particles,
      particleGeometry,
      particleMaterial,
      live,
      next: 0,
      seen: runtime.footsteps.count,
      tileX: Number.NaN,
      tileZ: Number.NaN,
      wasPerspective: false,
      scratch: {
        matrix: new THREE.Matrix4(),
        position: new THREE.Vector3(),
        rotation: new THREE.Quaternion(),
        scale: new THREE.Vector3(),
        up: new THREE.Vector3(0, 1, 0),
        tint: new THREE.Color(),
        counts: new Int32Array(2),
      },
    };
  }, [layout, runtime.uniforms, runtime.footsteps, pool]);

  useEffect(
    () => () => {
      for (const mesh of detail.grass) mesh.dispose();
      for (const material of detail.grassMaterials) material.dispose();
      for (const texture of detail.grassTextures) texture.dispose();
      detail.tuftGeometry.dispose();
      detail.edgeMesh.dispose();
      detail.flat.dispose();
      detail.pebbles.dispose();
      detail.pebbleMaterial.dispose();
      detail.puddles.dispose();
      detail.puddleGeometry.dispose();
      detail.puddleMaterial.dispose();
      detail.particleGeometry.dispose();
      detail.particleMaterial.dispose();
    },
    [detail],
  );

  /** Re-plants the grass pool on the cells around the player, shrinking toward the edge. */
  function plant(px: number, pz: number, radius: number) {
    const { scratch } = detail;
    const counts = scratch.counts;
    counts.fill(0);
    const cell = GROUND_DETAIL.cell;
    const reach = Math.ceil(radius / cell);
    const cx = Math.floor(px / cell);
    const cz = Math.floor(pz / cell);
    for (let gz = cz - reach; gz <= cz + reach; gz += 1) {
      for (let gx = cx - reach; gx <= cx + reach; gx += 1) {
        const jitterX = hash2(gx, gz, 61);
        const jitterZ = hash2(gx, gz, 62);
        const x = (gx + jitterX) * cell;
        const z = (gz + jitterZ) * cell;
        const distance = Math.hypot(x - px, z - pz);
        if (distance > radius || !grassy(layout, x, z)) continue;
        if (hash2(gx, gz, 63) > GROUND_DETAIL.density) continue;
        const flower = hash2(gx, gz, 64) < 0.14 ? 1 : 0;
        const mesh = detail.grass[flower];
        const slot = counts[flower] ?? 0;
        if (!mesh || slot >= pool) continue;
        const keep = 1 - Math.min(1, Math.max(0, (distance - radius * 0.6) / (radius * 0.4)));
        scratch.position.set(x, groundHeight(layout, x, z), z);
        scratch.rotation.setFromAxisAngle(scratch.up, hash2(gx, gz, 65) * Math.PI);
        scratch.scale.setScalar((0.75 + hash2(gx, gz, 66) * 0.5) * keep);
        mesh.setMatrixAt(
          slot,
          scratch.matrix.compose(scratch.position, scratch.rotation, scratch.scale),
        );
        counts[flower] = slot + 1;
      }
    }
    for (let i = 0; i < detail.grass.length; i += 1) {
      const mesh = detail.grass[i];
      if (!mesh) continue;
      mesh.count = counts[i] ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  useFrame(({ size }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const { player, camera, weather, layout: world } = runtime;
    const scale = detail.particleMaterial.uniforms.uScale;
    if (scale) scale.value = (GROUND_DETAIL.particleSize * size.height) / 2;
    const perspective = camera.perspective;

    // Dense grass only in third-person, re-planted per tile walked.
    for (const mesh of detail.grass) mesh.visible = perspective && pool > 0;
    if (perspective && pool > 0) {
      const tileX = Math.floor(player.x);
      const tileZ = Math.floor(player.z);
      if (tileX !== detail.tileX || tileZ !== detail.tileZ || !detail.wasPerspective) {
        detail.tileX = tileX;
        detail.tileZ = tileZ;
        plant(player.x, player.z, GROUND_DETAIL.radius[level]);
      }
    }
    detail.wasPerspective = perspective;

    // Puddles fill with the surface wetness.
    detail.puddleMaterial.opacity = Math.min(0.6, weather.wetness * 0.75);
    detail.puddles.visible = weather.wetness > 0.02;

    // Footsteps: dust on dry paths, splashes when wet, grass bits on lawns.
    const steps = runtime.footsteps;
    if (steps.count !== detail.seen) {
      detail.seen = steps.count;
      const tx = Math.floor(steps.x);
      const tz = Math.floor(steps.z);
      const ground = world.village.ground[tz * world.width + tx];
      const wet = weather.wetness > 0.35;
      const grassyStep = ground === "grass" || ground === "flowers";
      const tint = detail.scratch.tint;
      if (wet) tint.set(PALETTE.foam);
      else if (grassyStep) tint.set(PALETTE.lime);
      else tint.set(PALETTE.wheat);
      const y = groundHeight(world, steps.x, steps.z) + 0.04;
      const burst = runtime.reducedMotion ? 0 : wet ? 6 : grassyStep ? 3 : 5;
      for (let k = 0; k < burst; k += 1) {
        const particle = detail.live[detail.next];
        const index = detail.next;
        detail.next = (detail.next + 1) % detail.live.length;
        if (!particle) continue;
        const angle = hash2(steps.count, k, 71) * Math.PI * 2;
        const speed = 0.4 + hash2(steps.count, k, 72) * 0.5;
        particle.life = 1;
        particle.x = steps.x + Math.cos(angle) * 0.08;
        particle.y = y;
        particle.z = steps.z + Math.sin(angle) * 0.08;
        particle.vx = Math.cos(angle) * speed;
        particle.vz = Math.sin(angle) * speed;
        particle.vy = wet ? 1.6 + hash2(steps.count, k, 73) : 0.5;
        const tints = detail.particleGeometry.getAttribute("tint") as THREE.BufferAttribute;
        tints.setXYZ(index, tint.r, tint.g, tint.b);
        tints.needsUpdate = true;
      }
    }
    const positions = detail.particleGeometry.getAttribute("position") as THREE.BufferAttribute;
    const alphas = detail.particleGeometry.getAttribute("alpha") as THREE.BufferAttribute;
    for (let i = 0; i < detail.live.length; i += 1) {
      const particle = detail.live[i];
      if (!particle) continue;
      if (particle.life > 0) {
        particle.life = Math.max(0, particle.life - delta / GROUND_DETAIL.particleLife);
        particle.vy -= 6 * delta;
        particle.x += particle.vx * delta;
        particle.y = Math.max(
          particle.y + particle.vy * delta,
          groundHeight(world, particle.x, particle.z) + 0.02,
        );
        particle.z += particle.vz * delta;
        particle.vx *= 0.9;
        particle.vz *= 0.9;
      }
      positions.setXYZ(i, particle.x, particle.y, particle.z);
      alphas.setX(i, particle.life * 0.85);
    }
    positions.needsUpdate = true;
    alphas.needsUpdate = true;
  });

  return <primitive object={detail.group} />;
}
