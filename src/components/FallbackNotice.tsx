"use client";

import { FALLBACK_MESSAGES, clearFallbackReason, isFallbackReason } from "@/lib/fallback";
import { useStoredValue } from "@/lib/hooks";
import { STORAGE_KEYS } from "@/lib/storage";
import { PixelIcon } from "./PixelIcon";

/** Explains why a visitor landed on /plain when the village sent them here. */
export function FallbackNotice() {
  const stored = useStoredValue("session", STORAGE_KEYS.fallbackReason);
  if (!isFallbackReason(stored)) {
    return null;
  }
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 p-4 pixel-panel">
      <PixelIcon name="pin" size={20} />
      <p className="flex-1">{FALLBACK_MESSAGES[stored]}</p>
      <button
        type="button"
        onClick={clearFallbackReason}
        className="pixel-button bg-cloud px-3 py-2 text-ink hover:bg-wheat"
      >
        Dismiss
      </button>
    </div>
  );
}
