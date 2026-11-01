import { STORAGE_KEYS, readStorage, writeStorage } from "./storage";

export type FallbackReason = "webgl" | "reduced-motion" | "low-power" | "low-fps" | "error";

export const FALLBACK_MESSAGES: Record<FallbackReason, string> = {
  webgl: "Your browser couldn't start WebGL, so you're seeing the standard portfolio instead.",
  "reduced-motion": "You asked for reduced motion, so here's the standard, motion-free portfolio.",
  "low-power": "Your device looks like it's saving power, so here's the lightweight portfolio.",
  "low-fps": "The village was running slowly, so here's the lightweight portfolio.",
  error: "The village hit a problem while loading, so here's the standard portfolio.",
};

export function isFallbackReason(value: string | null): value is FallbackReason {
  return value !== null && Object.prototype.hasOwnProperty.call(FALLBACK_MESSAGES, value);
}

export function rememberFallbackReason(reason: FallbackReason): void {
  writeStorage("session", STORAGE_KEYS.fallbackReason, reason);
}

export function clearFallbackReason(): void {
  writeStorage("session", STORAGE_KEYS.fallbackReason, null);
}

export function readFallbackReason(): FallbackReason | null {
  const value = readStorage("session", STORAGE_KEYS.fallbackReason);
  return isFallbackReason(value) ? value : null;
}
