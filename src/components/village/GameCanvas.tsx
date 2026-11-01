"use client";

import { useEffect, type RefObject } from "react";
import { createGame } from "@/game/createGame";
import type { GameBridge } from "@/game/bridge";
import type { AudioSystem } from "@/game/systems/audio";
import { STORAGE_KEYS, readFlag } from "@/lib/storage";

interface GameCanvasProps {
  bridge: GameBridge;
  audio: AudioSystem;
  /** The focusable element Phaser mounts into and reads keyboard input from. */
  containerRef: RefObject<HTMLDivElement | null>;
  inert: boolean;
  describedBy: string;
}

function pixelFontFamily(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-pixelify")
    .trim();
  return value ? `${value}, monospace` : "monospace";
}

/**
 * Client-only Phaser mount (loaded with next/dynamic, ssr: false). Creates exactly one game
 * per mount and destroys it on unmount, so React strict mode and route changes never leave a
 * second Phaser instance running.
 */
export default function GameCanvas({
  bridge,
  audio,
  containerRef,
  inert,
  describedBy,
}: GameCanvasProps) {
  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) {
      return;
    }
    const handle = createGame({
      parent,
      bridge,
      audio,
      options: {
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        touch: window.matchMedia("(pointer: coarse)").matches,
        night: readFlag("local", STORAGE_KEYS.night, false),
        fontFamily: pixelFontFamily(),
      },
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
      className="absolute inset-0 touch-none overflow-hidden outline-none select-none focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-gold [&>canvas]:block"
    />
  );
}
