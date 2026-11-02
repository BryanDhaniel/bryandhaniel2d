"use client";

import { useEffect, useId, useState } from "react";
import type { GameBridge } from "@/game/bridge";
import type { CameraTuning } from "@/game/settings/types";

interface Slider {
  key: Exclude<keyof CameraTuning, "showColliders">;
  label: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: readonly Slider[] = [
  { key: "fov", label: "Field of view", min: 40, max: 80, step: 1 },
  { key: "armLength", label: "Arm length", min: 1.5, max: 8, step: 0.1 },
  { key: "shoulderOffset", label: "Shoulder offset", min: 0, max: 1.5, step: 0.05 },
  { key: "positionDamping", label: "Follow damping", min: 2, max: 40, step: 0.5 },
  { key: "rotationDamping", label: "Rotation damping", min: 2, max: 40, step: 0.5 },
  { key: "shadowBias", label: "Shadow bias", min: -0.005, max: 0.001, step: 0.0001 },
  { key: "shadowNormalBias", label: "Shadow normal bias", min: 0, max: 0.15, step: 0.005 },
];

interface DebugPanelProps {
  bridge: GameBridge;
  onClose: () => void;
}

/**
 * Live camera and shadow tuning (toggle with the backquote key): sliders write straight into
 * the running game, and the collider view draws the camera's and the player's colliders.
 * Nothing is saved; copy values you like into src/game3d/config/camera.ts.
 */
export function DebugPanel({ bridge, onClose }: DebugPanelProps) {
  const [tuning, setTuning] = useState<CameraTuning | null>(null);
  const id = useId();

  useEffect(() => {
    const off = bridge.on("tuning", (next) => setTuning(next));
    bridge.emit("requestTuning", null);
    return off;
  }, [bridge]);

  const change = (next: CameraTuning) => {
    setTuning(next);
    bridge.emit("tune", next);
  };

  return (
    <section
      aria-label="Camera debug panel"
      className="absolute bottom-4 left-4 z-40 w-72 max-w-[calc(100vw-2rem)] space-y-2 p-3 text-sm pixel-panel"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base">Camera debug</h2>
        <button
          type="button"
          onClick={onClose}
          className="pixel-button bg-cloud px-2 py-0.5 text-ink hover:bg-wheat"
        >
          Close
        </button>
      </div>
      {tuning ? (
        <>
          {SLIDERS.map((slider) => (
            <label key={slider.key} className="block">
              <span className="flex justify-between">
                <span>{slider.label}</span>
                <output htmlFor={`${id}-${slider.key}`} className="text-slate">
                  {tuning[slider.key].toFixed(slider.step < 0.01 ? 4 : 2)}
                </output>
              </span>
              <input
                id={`${id}-${slider.key}`}
                type="range"
                min={slider.min}
                max={slider.max}
                step={slider.step}
                value={tuning[slider.key]}
                onChange={(event) =>
                  change({ ...tuning, [slider.key]: Number(event.target.value) })
                }
                className="w-full accent-violet"
              />
            </label>
          ))}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={tuning.showColliders}
              onChange={(event) => change({ ...tuning, showColliders: event.target.checked })}
              className="accent-violet"
            />
            Show colliders
          </label>
        </>
      ) : (
        <p className="text-slate">Waiting for the village…</p>
      )}
    </section>
  );
}
