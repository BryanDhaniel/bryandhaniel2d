"use client";

import { useEffect, useRef } from "react";
import { MINIMAP_TERRAIN, type GameBridge, type MapInfo } from "@/game/bridge";
import { PALETTE, type PaletteName } from "@/game/palette";
import type { CameraMode } from "@/game/settings/types";

const TERRAIN_COLORS: Record<number, PaletteName> = {
  [MINIMAP_TERRAIN.grass]: "grass",
  [MINIMAP_TERRAIN.path]: "wheat",
  [MINIMAP_TERRAIN.water]: "water",
  [MINIMAP_TERRAIN.forest]: "forest",
  [MINIMAP_TERRAIN.blocked]: "stone",
  [MINIMAP_TERRAIN.building]: "ember",
};

const SCALE = 4;
const DEG = 180 / Math.PI;

interface MiniMapProps {
  info: MapInfo;
  bridge: GameBridge;
  mode: CameraMode;
  /** Walk to a building, then hand focus back to the game. */
  onTravel: (sectionId: MapInfo["markers"][number]["sectionId"]) => void;
}

/** Keeps an angle continuous between updates, so CSS never rotates the long way round. */
function unwrap(previous: number, next: number): number {
  let d = (next - previous) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return previous + d;
}

/**
 * Overview of the village drawn once from the game's terrain grid, with the player's heading
 * cone and a button per building. In third-person it turns with the camera (the way you look
 * is always up) and keeps the player in the middle. Position updates write to the DOM
 * directly, so they never re-render React.
 */
export function MiniMap({ info, bridge, mode, onTravel }: MiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const coneRef = useRef<HTMLSpanElement>(null);
  const angles = useRef({ view: 0, heading: 0 });
  const rotating = mode === "thirdPerson";
  const mapWidth = info.width * SCALE;
  const mapHeight = info.height * SCALE;
  const side = Math.max(mapWidth, mapHeight);

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
      bridge.on("position", ({ x, y, heading, viewYaw }) => {
        const layer = layerRef.current;
        const cone = coneRef.current;
        if (!layer || !cone) return;
        const a = angles.current;
        a.view = unwrap(a.view, viewYaw * DEG);
        a.heading = unwrap(a.heading, heading * DEG);
        const px = Math.round(x * SCALE);
        const py = Math.round(y * SCALE);
        if (rotating) {
          const half = side / 2;
          layer.style.transform = `translate(${half}px, ${half}px) rotate(${-a.view}deg) translate(${-px}px, ${-py}px)`;
          cone.style.transform = `translate(${half}px, ${half}px) rotate(${a.heading - a.view}deg)`;
        } else {
          layer.style.transform = "none";
          cone.style.transform = `translate(${px}px, ${py}px) rotate(${a.heading}deg)`;
        }
      }),
    [bridge, rotating, side],
  );

  return (
    <nav
      aria-label="Village map"
      className={`relative overflow-hidden bg-forest pixel-inset ${rotating ? "rounded-full" : ""}`}
      style={rotating ? { width: side, height: side } : { width: mapWidth, height: mapHeight }}
    >
      <div
        ref={layerRef}
        className="absolute top-0 left-0 origin-top-left transition-transform duration-100 ease-linear motion-reduce:transition-none"
        style={{ width: mapWidth, height: mapHeight }}
      >
        <canvas
          ref={canvasRef}
          width={info.width}
          height={info.height}
          aria-hidden="true"
          className="pixelated block"
          style={{ width: mapWidth, height: mapHeight }}
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
      </div>
      {/* The player: a dot with a cone pointing the way they face. */}
      <span
        ref={coneRef}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 transition-transform duration-100 ease-linear motion-reduce:transition-none"
      >
        <span className="absolute -top-[9px] -left-[5px] h-0 w-0 border-x-[5px] border-b-[7px] border-x-transparent border-b-gold/80" />
        <span className="absolute -top-1 -left-1 size-2 border border-ink bg-gold" />
      </span>
    </nav>
  );
}
