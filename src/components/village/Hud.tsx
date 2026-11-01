"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { SectionId } from "@/content/portfolio";
import type { GameBridge, MapInfo } from "@/game/bridge";
import { PixelIcon } from "@/components/PixelIcon";
import { MiniMap } from "./MiniMap";
import { SkipLink } from "./SkipLink";

interface HudProps {
  bridge: GameBridge;
  mapInfo: MapInfo | null;
  location: string;
  near: { sectionId: SectionId; label: string } | null;
  nearTitle: string | null;
  touch: boolean;
  muted: boolean;
  night: boolean;
  inert: boolean;
  onToggleMute: () => void;
  onToggleNight: () => void;
  onTravel: (sectionId: SectionId) => void;
}

function ToggleButton({
  pressed,
  label,
  icon,
  onClick,
}: {
  pressed: boolean;
  label: string;
  icon: Parameters<typeof PixelIcon>[0]["name"];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={onClick}
      className="pixel-button size-11 bg-cloud text-ink hover:bg-wheat aria-pressed:bg-wheat"
    >
      <PixelIcon name={icon} size={20} />
    </button>
  );
}

export function Hud({
  bridge,
  mapInfo,
  location,
  near,
  nearTitle,
  touch,
  muted,
  night,
  inert,
  onToggleMute,
  onToggleNight,
  onTravel,
}: HudProps) {
  return (
    <div
      inert={inert}
      // wrap-reverse: on narrow screens the location card drops to its own row under the buttons.
      className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-wrap-reverse items-start justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:flex-nowrap sm:p-4"
    >
      <div className="pointer-events-auto flex min-w-0 basis-full flex-col gap-2 sm:basis-auto">
        <div className="max-w-[16rem] min-w-0 px-3 py-2 pixel-panel sm:max-w-xs">
          <p
            className="flex items-center gap-2 text-sm leading-tight sm:text-base"
            role="status"
            aria-live="polite"
          >
            <PixelIcon name="pin" size={20} className="shrink-0" />
            <span className="truncate">{location}</span>
          </p>
          <AnimatePresence initial={false}>
            {near && nearTitle ? (
              <motion.p
                key={near.sectionId + near.label}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.12 }}
                className="overflow-hidden text-sm leading-tight text-slate"
              >
                <span className="mt-1 block">
                  {near.label} · {nearTitle} ·{" "}
                  <strong className="text-ink">{touch ? "tap A" : "press E"}</strong>
                </span>
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
        {mapInfo ? (
          <div className="hidden md:block">
            <MiniMap info={mapInfo} bridge={bridge} onTravel={onTravel} />
          </div>
        ) : null}
      </div>
      <div className="pointer-events-auto ml-auto flex shrink-0 items-start gap-2">
        <ToggleButton
          pressed={muted}
          label={muted ? "Unmute sound effects" : "Mute sound effects"}
          icon={muted ? "soundOff" : "soundOn"}
          onClick={onToggleMute}
        />
        <ToggleButton
          pressed={night}
          label={night ? "Switch to day" : "Switch to night"}
          icon={night ? "moon" : "sun"}
          onClick={onToggleNight}
        />
        <SkipLink compact />
      </div>
    </div>
  );
}
