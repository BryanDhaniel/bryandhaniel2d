"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import type { CameraMode } from "@/game/settings/types";

interface ControlsHintProps {
  id: string;
  visible: boolean;
  touch: boolean;
  mode: CameraMode;
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="border-2 border-ink bg-cloud px-1.5 py-0.5 text-ink shadow-pixel-sm">
      {children}
    </kbd>
  );
}

/**
 * First-run controls reminder. It stays in the DOM (visually hidden after the first step)
 * because the game element references it with aria-describedby.
 */
const TEXT: Record<CameraMode, { touch: string; keys: string }> = {
  isometric: {
    touch:
      "Use the D-pad or tap the ground to walk, the turn buttons to rotate the view and pinch to zoom. Tap a building or press A at its door to look inside.",
    keys: "Walk with W A S D or the arrow keys, hold Shift to run, turn the view with Q and R, zoom with plus, minus or the mouse wheel, and press E at a door to look inside. You can also click to walk. Press V for the third-person view.",
  },
  thirdPerson: {
    touch:
      "Walk with the stick on the left, drag on the right half of the screen to look around, and tap A at a door to look inside.",
    keys: "Walk with W A S D, hold Shift to run, look around by dragging the mouse or with the arrow keys, press C to put the camera behind you, and press E at a door to look inside. Press V for the isometric view.",
  },
};

export function ControlsHint({ id, visible, touch, mode }: ControlsHintProps) {
  const text = touch ? TEXT[mode].touch : TEXT[mode].keys;
  return (
    <>
      <p id={id} className="sr-only">
        {text}
      </p>
      <AnimatePresence>
        {visible ? (
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.6, delay: 1.2 } }}
            className={`pointer-events-none absolute inset-x-0 z-20 flex justify-center px-4 ${touch ? "bottom-44" : "bottom-6"}`}
          >
            <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-2 text-center text-sm pixel-panel sm:text-base">
              {touch && mode === "thirdPerson" ? (
                <span>Left stick to walk · drag right side to look · A to enter</span>
              ) : touch ? (
                <span>D-pad or tap to walk · tap a building to enter</span>
              ) : mode === "thirdPerson" ? (
                <>
                  <Key>W</Key>
                  <Key>A</Key>
                  <Key>S</Key>
                  <Key>D</Key>
                  <span>walk · drag or arrows to look ·</span>
                  <Key>E</Key>
                  <span>enter ·</span>
                  <Key>C</Key>
                  <span>reset ·</span>
                  <Key>V</Key>
                  <span>view</span>
                </>
              ) : (
                <>
                  <Key>W</Key>
                  <Key>A</Key>
                  <Key>S</Key>
                  <Key>D</Key>
                  <span>or arrows to walk ·</span>
                  <Key>Q</Key>
                  <Key>R</Key>
                  <span>turn ·</span>
                  <Key>E</Key>
                  <span>to enter · click to walk</span>
                </>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
