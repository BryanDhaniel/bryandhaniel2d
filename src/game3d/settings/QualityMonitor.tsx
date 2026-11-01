"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { useStore } from "zustand";
import { QUALITY } from "@/game3d/config/visuals";
import { useRuntime } from "@/game3d/runtime";

/**
 * Auto quality: drei's PerformanceMonitor measures frame times and steps the tier up when
 * there is headroom and down when frames are slow, settling after a few flip-flops. Its
 * factor also scales the pixel ratio within the tier's cap.
 */
export function QualityMonitor() {
  const runtime = useRuntime();
  const auto = useStore(runtime.store, (state) => state.quality === "auto");
  if (!auto) return null;
  return (
    <PerformanceMonitor
      bounds={(refresh) => (refresh > 90 ? [...QUALITY.boundsHigh] : [...QUALITY.bounds60])}
      flipflops={QUALITY.flipflops}
      onIncline={() => runtime.quality.incline()}
      onDecline={() => runtime.quality.decline()}
      onChange={({ factor }) => runtime.store.getState().setDprFactor(factor)}
    />
  );
}
