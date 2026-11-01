/** Safe wrappers around Web Storage: private modes and blocked storage never throw. */

export const STORAGE_KEYS = {
  muted: "kiz-village:muted",
  timeMode: "kiz-village:time-mode",
  weather: "kiz-village:weather",
  quality: "kiz-village:quality",
  retro: "kiz-village:retro",
  playAnyway: "kiz-village:play-anyway",
  fallbackReason: "kiz-village:fallback-reason",
} as const;

export type StorageArea = "local" | "session";

type Listener = () => void;

const listeners = new Set<Listener>();

function area(kind: StorageArea): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readStorage(kind: StorageArea, key: string): string | null {
  try {
    return area(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorage(kind: StorageArea, key: string, value: string | null): void {
  try {
    const storage = area(kind);
    if (value === null) {
      storage?.removeItem(key);
    } else {
      storage?.setItem(key, value);
    }
  } catch {
    // Storage is full or blocked; the preference just won't persist.
  }
  listeners.forEach((listener) => listener());
}

/** Subscribes to changes made through writeStorage and to changes from other tabs. */
export function subscribeStorage(listener: Listener): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function readFlag(kind: StorageArea, key: string, fallback: boolean): boolean {
  const value = readStorage(kind, key);
  return value === null ? fallback : value === "1";
}

export function writeFlag(kind: StorageArea, key: string, value: boolean): void {
  writeStorage(kind, key, value ? "1" : "0");
}
