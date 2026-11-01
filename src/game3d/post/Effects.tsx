"use client";

import { useFrame, useThree } from "@react-three/fiber";
import {
  BlendFunction,
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  KernelSize,
  NoiseEffect,
  NormalPass,
  RenderPass,
  SSAOEffect,
  TiltShiftEffect,
  type Effect,
} from "postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { LUTCubeLoader } from "three/examples/jsm/loaders/LUTCubeLoader.js";
import { useStore } from "zustand";
import { LUT_PATHS } from "@/game3d/config/assets";
import {
  GRADE_NAMES,
  GRADES,
  POST,
  QUALITY_TIERS,
  type TierFeatures,
} from "@/game3d/config/visuals";
import { useRuntime } from "@/game3d/runtime";
import { GradeEffect } from "./GradeEffect";
import { generateLut, lutTexture } from "./lut";
import { PixelRenderPass } from "./PixelPass";

interface ChainOptions {
  tier: TierFeatures;
  pixelMode: boolean;
  grain: boolean;
  aberration: boolean;
}

interface Chain {
  composer: EffectComposer;
  bloom: BloomEffect | null;
  grade: GradeEffect;
}

/**
 * The post stack, rebuilt only when the tier or a toggle changes: scene (or Pixel mode's
 * low-resolution pass) → SSAO (High) → bloom and tilt-shift → exposure, ACES, LUT grade and
 * vignette → optional film grain and chromatic aberration. It takes over rendering (frame
 * priority 1) and frees every render target when it goes away.
 */
function Composer({ tier, pixelMode, grain, aberration }: ChainOptions) {
  const runtime = useRuntime();
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const interactive = useStore(runtime.store, (state) => state.interactive);

  const luts = useMemo(() => GRADE_NAMES.map((name) => lutTexture(generateLut(GRADES[name]))), []);
  useEffect(() => () => luts.forEach((lut) => lut.dispose()), [luts]);

  // Graded .cube files replace the generated LUTs once the village is interactive.
  useEffect(() => {
    if (!interactive) return;
    let cancelled = false;
    const loader = new LUTCubeLoader();
    GRADE_NAMES.forEach((name, index) => {
      const path = LUT_PATHS[name];
      if (!path) return;
      loader
        .loadAsync(path)
        .then((result) => {
          if (cancelled) {
            result.texture3D.dispose();
            return;
          }
          luts[index]?.dispose();
          luts[index] = result.texture3D as THREE.Data3DTexture;
        })
        .catch((error: unknown) =>
          console.warn(
            `LUT "${path}" could not be loaded; using the built-in ${name} grade.`,
            error,
          ),
        );
    });
    return () => {
      cancelled = true;
    };
  }, [interactive, luts]);

  // The chain is created inside an effect (not a memo): disposing a composer empties it, so
  // each mount, including React strict mode's second one, builds a fresh chain.
  const chainRef = useRef<Chain | null>(null);
  useEffect(() => {
    const chain = createChain();
    chainRef.current = chain;
    chain.composer.setSize(size.width, size.height);
    return () => {
      chainRef.current = null;
      chain.composer.dispose();
      // The composer switches auto-clear off; give the renderer back its default.
      gl.autoClear = true;
    };
    // `size` is applied by the effect below; rebuilding on resize would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, tier, pixelMode, grain, aberration, luts]);

  useEffect(() => {
    chainRef.current?.composer.setSize(size.width, size.height);
  }, [size]);

  useFrame((_, delta) => {
    const chain = chainRef.current;
    if (!chain) return;
    const state = runtime.cycle.state;
    const fallback = luts[0];
    if (chain.bloom) chain.bloom.intensity = POST.bloomIntensity * state.bloom;
    if (!fallback) return;
    chain.grade.setGrade(
      state.exposure,
      luts[state.gradeA] ?? fallback,
      luts[state.gradeB] ?? fallback,
      state.gradeMix,
      tier.post ? 1 : 0,
      tier.post ? POST.vignetteDarkness : 0,
    );
    chain.composer.render(delta);
  }, 1);

  return null;

  function createChain(): Chain {
    const composer = new EffectComposer(gl, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: pixelMode ? 0 : tier.multisampling,
    });
    composer.addPass(
      pixelMode ? new PixelRenderPass(scene, camera) : new RenderPass(scene, camera),
    );
    let ssao: SSAOEffect | null = null;
    if (tier.ssao && !pixelMode) {
      const normals = new NormalPass(scene, camera);
      composer.addPass(normals);
      ssao = new SSAOEffect(camera, normals.texture, {
        blendFunction: BlendFunction.MULTIPLY,
        samples: 11,
        rings: 4,
        radius: POST.aoRadius,
        intensity: POST.aoIntensity,
        bias: 0.02,
        fade: 0.012,
        luminanceInfluence: 0.55,
        worldDistanceThreshold: POST.aoDistance,
        worldDistanceFalloff: POST.aoDistance * 0.25,
        worldProximityThreshold: POST.aoFalloff,
        worldProximityFalloff: POST.aoFalloff * 0.5,
        resolutionScale: 0.5,
        depthAwareUpsampling: true,
      });
    }
    const bloom = tier.post
      ? new BloomEffect({
          mipmapBlur: true,
          luminanceThreshold: POST.bloomThreshold,
          luminanceSmoothing: POST.bloomSmoothing,
          intensity: POST.bloomIntensity,
          radius: POST.bloomRadius,
        })
      : null;
    const tilt = tier.tiltShift
      ? new TiltShiftEffect({
          focusArea: POST.tiltFocusArea,
          feather: POST.tiltFeather,
          kernelSize: KernelSize.SMALL,
        })
      : null;
    const first: Effect[] = [];
    if (ssao) first.push(ssao);
    if (bloom) first.push(bloom);
    if (tilt) first.push(tilt);
    if (first.length > 0) composer.addPass(new EffectPass(camera, ...first));
    const grade = new GradeEffect(luts[1] ?? luts[0] ?? lutTexture(generateLut(GRADES.day)));
    const finish: Effect[] = [grade];
    if (grain) {
      const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: true });
      noise.blendMode.opacity.value = POST.grainOpacity;
      finish.push(noise);
    }
    composer.addPass(new EffectPass(camera, ...finish));
    if (aberration) {
      const offset = new THREE.Vector2(POST.aberrationOffset, POST.aberrationOffset);
      composer.addPass(
        new EffectPass(
          camera,
          new ChromaticAberrationEffect({ offset, radialModulation: true, modulationOffset: 0.25 }),
        ),
      );
    }
    return { composer, bloom, grade };
  }
}

/** Mounts the post stack on Medium and High (and for Pixel mode on any tier). */
export function Effects() {
  const runtime = useRuntime();
  const level = useStore(runtime.store, (state) => state.level);
  const pixelMode = useStore(runtime.store, (state) => state.pixelMode);
  const grain = useStore(runtime.store, (state) => state.grain);
  const aberration = useStore(runtime.store, (state) => state.aberration);
  const tier = QUALITY_TIERS[level];
  if (!tier.post && !pixelMode) return null;
  return (
    <Composer
      key={`${level}:${pixelMode}:${grain}:${aberration}`}
      tier={tier}
      pixelMode={pixelMode}
      grain={grain && tier.post}
      aberration={aberration && tier.post}
    />
  );
}
