"use client";

import { useEffect, useRef } from "react";
import { MINIMAP_TERRAIN, type GameBridge, type MapInfo } from "@/game/bridge";
import { PALETTE, type PaletteName } from "@/game/palette";

const TERRAIN_COLORS: Record<number, PaletteName> = {
  [MINIMAP_TERRAIN.grass]: "grass",
  [MINIMAP_TERRAIN.path]: "wheat",
  [MINIMAP_TERRAIN.water]: "water",
  [MINIMAP_TERRAIN.forest]: "forest",
  [MINIMAP_TERRAIN.blocked]: "stone",
  [MINIMAP_TERRAIN.building]: "ember",
};

const SCALE = 4;

interface MiniMapProps {
  info: MapInfo;
  bridge: GameBridge;
  /** Walk to a building, then hand focus back to the game. */
  onTravel: (sectionId: MapInfo["markers"][number]["sectionId"]) => void;
}

/**
 * Overview of the village drawn once from the game's terrain grid. The player dot moves by
 * writing to its style directly, so position updates never re-render React.
 */
export function MiniMap({ info, bridge, onTravel }: MiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) {
      return;
    }
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const terrain = info.terrain[y * info.width + x] ?? MINIMAP_TERRAIN.grass;
        ctx.fillStyle = PALETTE[TERRAIN_COLORS[terrain] ?? "grass"];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }, [info]);

  useEffect(
    () =>
      bridge.on("position", ({ x, y }) => {
        const dot = dotRef.current;
        if (dot) {
          dot.style.transform = `translate(${Math.round(x * SCALE)}px, ${Math.round(y * SCALE)}px)`;
        }
      }),
    [bridge],
  );

  return (
    <nav
      aria-label="Village map"
      className="relative bg-ink pixel-inset"
      style={{ width: info.width * SCALE, height: info.height * SCALE }}
    >
      <canvas
        ref={canvasRef}
        width={info.width}
        height={info.height}
        aria-hidden="true"
        className="pixelated block"
        style={{ width: info.width * SCALE, height: info.height * SCALE }}
      />
      <span
        ref={dotRef}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 -mt-1 -ml-1 size-2 border border-ink bg-gold"
      />
      <ul>
        {info.markers.map((marker) => (
          <li
            key={marker.buildingId}
            className="absolute"
            style={{ left: marker.tileX * SCALE - 6, top: marker.tileY * SCALE - 6 }}
          >
            <button
              type="button"
              onClick={() => onTravel(marker.sectionId)}
              className="block size-3 border-2 border-ink bg-cloud hover:bg-gold focus-visible:bg-gold"
              aria-label={`Walk to the ${marker.label}`}
              title={marker.label}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
