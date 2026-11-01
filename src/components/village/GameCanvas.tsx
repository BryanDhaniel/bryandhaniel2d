"use client";

import { useEffect, useRef, type RefObject } from "react";
import { createGame } from "@/game/createGame";
import type { GameBridge } from "@/game/bridge";
import type { AudioSystem } from "@/game/systems/audio";
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

/**
 * Client-only Phaser mount (loaded with next/dynamic, ssr: false). Creates exactly one game
 * per mount and destroys it on unmount, so React strict mode and route changes never leave a
 * second Phaser instance running.
 *
 * The outer element is the focusable game area; the inner one is the clipping window the
 * low-resolution canvas is upscaled into (positioned by createGame).
 */
export default function GameCanvas({
  bridge,
  audio,
  containerRef,
  inert,
  describedBy,
}: GameCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const viewport = viewportRef.current;
    if (!container || !viewport) {
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const settings = readVillageSettings(
      defaultQualityFor({ touch, reducedMotion, lowPower: getCapabilities().lowPower }),
    );
    const handle = createGame({
      container,
      viewport,
      bridge,
      audio,
      options: { reducedMotion, touch, ...settings },
    });
    return () => handle.destroy();
  }, [bridge, audio, containerRef]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-roledescription="game"
      aria-label="Pixel village. Walk with the arrow keys or W A S D, hold Shift to run, and press E at a door to open that section."
      aria-describedby={describedBy}
      inert={inert}
      onBlur={() => bridge.emit("resetInput", null)}
      // Phaser prevents the default on canvas mousedown, which would stop the click from
      // focusing this element, so focus it explicitly to keep keyboard play working.
      onPointerDown={() => containerRef.current?.focus({ preventScroll: true })}
      className="absolute inset-0 touch-none overflow-hidden bg-ink outline-none select-none focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-gold"
    >
      <div ref={viewportRef} className="absolute overflow-hidden" />
    </div>
  );
}
