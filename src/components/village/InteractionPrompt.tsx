"use client";

import { useEffect, useRef, useState } from "react";
import type { GameBridge } from "@/game/bridge";

interface InteractionPromptProps {
  bridge: GameBridge;
  touch: boolean;
  hidden: boolean;
  onActivate: () => void;
}

/**
 * The "E / Tap" bubble over the building the player is standing at. It's HTML rather than
 * canvas text so it stays crisp, uses the UI font, and stays readable whatever the lighting
 * or post-processing does. Position updates write straight to the DOM (no re-render), and the
 * bubble never rises above `--prompt-min-top`, so the HUD can't cover it.
 */
export function InteractionPrompt({ bridge, touch, hidden, onActivate }: InteractionPromptProps) {
  const [visible, setVisible] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const subscriptions = [
      bridge.on("prompt", (next) => setVisible(next.visible)),
      bridge.on("promptPosition", ({ x, y }) => {
        const anchor = anchorRef.current;
        if (anchor) {
          anchor.style.transform = `translate(${Math.round(x)}px, max(${Math.round(y)}px, var(--prompt-min-top)))`;
        }
      }),
    ];
    return () => subscriptions.forEach((off) => off());
  }, [bridge]);

  return (
    <div
      ref={anchorRef}
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-20"
    >
      {visible && !hidden ? (
        <div className="-translate-x-1/2 -translate-y-full">
          <button
            type="button"
            tabIndex={-1}
            onClick={onActivate}
            className="prompt-bob pointer-events-auto relative mb-2 border-2 border-ink bg-cloud px-2 py-0.5 text-sm whitespace-nowrap text-ink shadow-[0_0_0_2px_var(--c-gold),3px_3px_0_2px_var(--c-ink)]"
          >
            {touch ? (
              "Tap"
            ) : (
              <>
                <kbd className="mr-1 border border-ink bg-wheat px-1">E</kbd>/ Tap
              </>
            )}
            <span className="absolute top-full left-1/2 -ml-1 h-0 w-0 border-x-4 border-t-4 border-x-transparent border-t-ink" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
