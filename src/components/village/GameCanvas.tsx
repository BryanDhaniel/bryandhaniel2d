"use client";

import { useState, type RefObject } from "react";
import type { GameBridge } from "@/game/bridge";
import VillageWorld, { type VillageOptions } from "@/game3d/VillageWorld";
import type { AudioSystem } from "@/game3d/systems/audio";
import { getCapabilities } from "@/lib/capabilities";
import { defaultQualityFor, readVillageSettings } from "@/lib/settings";

interface GameCanvasProps {
  bridge: GameBridge;
  audio: AudioSystem;
  /** The focusable element that fills the game area and receives keyboard input. */
  containerRef: RefObject<HTMLDivElement | null>;
  inert: boolean;
  describedBy: string;
}

function readOptions(): VillageOptions {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touch = window.matchMedia("(pointer: coarse)").matches;
  const settings = readVillageSettings(
    defaultQualityFor({ touch, reducedMotion, lowPower: getCapabilities().lowPower }),
  );
  return { reducedMotion, touch, ...settings };
}

/**
 * Client-only mount of the 3D village (this module is loaded with next/dynamic, ssr: false,
 * so three.js only ever downloads in the browser and never on /plain). The outer element is
 * the focusable game area; the React Three Fiber canvas fills it. Settings are read once at
 * mount; later changes travel over the bridge.
 */
export default function GameCanvas({
  bridge,
  audio,
  containerRef,
  inert,
  describedBy,
}: GameCanvasProps) {
  const [options] = useState(readOptions);
  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-roledescription="game"
      aria-label="Pixel village. Walk with the arrow keys or W A S D, hold Shift to run, turn the view with Q and R, zoom with plus and minus, and press E at a door to open that section."
      aria-describedby={describedBy}
      inert={inert}
      onBlur={() => bridge.emit("resetInput", null)}
      // Focus the game on click so keyboard play keeps working after using the mouse.
      onPointerDown={() => containerRef.current?.focus({ preventScroll: true })}
      className="absolute inset-0 touch-none overflow-hidden bg-ink outline-none select-none focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-gold"
    >
      <VillageWorld bridge={bridge} audio={audio} keyboardTarget={containerRef} options={options} />
    </div>
  );
}
