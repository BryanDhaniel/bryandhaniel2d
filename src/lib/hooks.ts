"use client";

import { useSyncExternalStore } from "react";
import { readStorage, subscribeStorage, type StorageArea } from "./storage";

/** Reads a Web Storage value and re-renders when it changes. `null` during SSR. */
export function useStoredValue(kind: StorageArea, key: string): string | null {
  return useSyncExternalStore(
    subscribeStorage,
    () => readStorage(kind, key),
    () => null,
  );
}

const noopSubscribe = () => () => {};

/** Media query match that is `serverValue` during SSR and live on the client. */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") {
        return noopSubscribe();
      }
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () =>
      typeof window.matchMedia === "function" ? window.matchMedia(query).matches : serverValue,
    () => serverValue,
  );
}

/** True once hydrated on the client; false on the server and during hydration. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
