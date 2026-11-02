"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SectionId } from "@/content/portfolio";
import type { MapInfo } from "@/game/bridge";
import type { CameraMode } from "@/game/settings/types";
import { PixelIcon } from "@/components/PixelIcon";

interface ViewControlsProps {
  mode: CameraMode;
  markers: MapInfo["markers"];
  onMode: (mode: CameraMode) => void;
  onResetCamera: () => void;
  onQuickTravel: (sectionId: SectionId) => void;
}

const MODE_LABEL: Record<CameraMode, string> = {
  isometric: "Isometric",
  thirdPerson: "Third-person",
};

/**
 * The camera buttons in the HUD: switch between the isometric and third-person views (V),
 * put the camera back behind the player (C), and a quick-travel list that jumps straight to a
 * building's door, for visitors who would rather not walk.
 */
export function ViewControls({
  mode,
  markers,
  onMode,
  onResetCamera,
  onQuickTravel,
}: ViewControlsProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const next: CameraMode = mode === "thirdPerson" ? "isometric" : "thirdPerson";

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLButtonElement>("[data-travel]")?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative flex items-start gap-2"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
    >
      <button
        type="button"
        onClick={() => onMode(next)}
        aria-label={`View: ${MODE_LABEL[mode]}. Switch to ${MODE_LABEL[next]} (V)`}
        title={`Switch to ${MODE_LABEL[next]} (V)`}
        className="pixel-button flex h-11 items-center gap-2 bg-cloud px-3 text-sm text-ink hover:bg-wheat"
      >
        <PixelIcon name={mode === "thirdPerson" ? "person" : "map"} size={20} />
        <span className="hidden sm:inline">{MODE_LABEL[mode]}</span>
      </button>
      <button
        type="button"
        onClick={onResetCamera}
        aria-label="Reset camera (C)"
        title="Reset camera (C)"
        className="pixel-button size-11 bg-cloud text-ink hover:bg-wheat"
      >
        <PixelIcon name="recenter" size={20} />
      </button>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Quick travel"
        title="Quick travel"
        onClick={() => setOpen((value) => !value)}
        className="pixel-button size-11 bg-cloud text-ink hover:bg-wheat aria-expanded:bg-wheat"
      >
        <PixelIcon name="pin" size={20} />
      </button>
      {open ? (
        <div
          id={listId}
          role="group"
          aria-label="Quick travel to a building"
          className="absolute top-14 right-0 z-40 w-60 max-w-[calc(100vw-1.5rem)] p-3 pixel-panel"
        >
          <p className="mb-2 text-sm tracking-wide text-slate uppercase">Quick travel</p>
          <ul className="space-y-1">
            {markers.map((marker) => (
              <li key={marker.buildingId}>
                <button
                  type="button"
                  data-travel
                  onClick={() => {
                    setOpen(false);
                    onQuickTravel(marker.sectionId);
                  }}
                  className="block w-full border-2 border-ink bg-cloud px-2 py-1.5 text-left text-sm text-ink hover:bg-gold focus-visible:bg-gold"
                >
                  {marker.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
