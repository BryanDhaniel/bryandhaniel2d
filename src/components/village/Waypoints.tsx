"use client";

import { useEffect, useRef } from "react";
import type { GameBridge, MapInfo } from "@/game/bridge";

interface WaypointsProps {
  bridge: GameBridge;
  markers: MapInfo["markers"];
  hidden: boolean;
}

/**
 * Third-person building markers: a small floating label with the distance above each
 * building, fading out near its door and far away. Positions arrive every frame and are
 * written straight to the DOM, so React never re-renders for them. Decorative (the HUD's
 * quick-travel list and the map carry the same information accessibly).
 */
export function Waypoints({ bridge, markers, hidden }: WaypointsProps) {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const distanceRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(
    () =>
      bridge.on("waypoints", (list) => {
        list.forEach((waypoint, index) => {
          const item = itemRefs.current[index];
          if (!item) return;
          if (!waypoint.visible) {
            if (item.style.visibility !== "hidden") item.style.visibility = "hidden";
            return;
          }
          item.style.visibility = "visible";
          item.style.opacity = waypoint.opacity.toFixed(2);
          item.style.transform = `translate(${Math.round(waypoint.x)}px, ${Math.round(waypoint.y)}px)`;
          const distance = distanceRefs.current[index];
          const text = `${Math.round(waypoint.distance)} m`;
          if (distance && distance.textContent !== text) distance.textContent = text;
        });
      }),
    [bridge],
  );

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-10 ${hidden ? "invisible" : ""}`}
    >
      {markers.map((marker, index) => (
        <div
          key={marker.buildingId}
          ref={(element) => {
            itemRefs.current[index] = element;
          }}
          className="absolute top-0 left-0"
          style={{ visibility: "hidden" }}
        >
          <div className="flex -translate-x-1/2 -translate-y-full flex-col items-center">
            <span className="border-2 border-ink bg-cloud/90 px-1.5 text-xs whitespace-nowrap text-ink shadow-pixel-sm">
              {marker.label}{" "}
              <span
                ref={(element) => {
                  distanceRefs.current[index] = element;
                }}
                className="text-slate"
              />
            </span>
            <span className="mt-0.5 size-2 rotate-45 border-2 border-ink bg-gold" />
          </div>
        </div>
      ))}
    </div>
  );
}
