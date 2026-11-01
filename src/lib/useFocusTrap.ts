"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.hasAttribute("inert") && element.getClientRects().length > 0,
  );
}

/**
 * Keeps Tab focus inside `ref` while mounted, closes on Escape, and returns focus to
 * whatever was focused before it opened.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  onEscape: () => void,
  initialFocus?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const root = ref.current;
    if (!root) {
      return;
    }
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (initialFocus?.current ?? focusables(root)[0] ?? root).focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onEscape();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const items = focusables(root);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        root.focus();
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !root.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !root.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (previous && previous.isConnected && !previous.closest("[inert]")) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [ref, onEscape, initialFocus]);
}
