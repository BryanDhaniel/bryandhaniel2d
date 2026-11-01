"use client";

import { useSyncExternalStore } from "react";

export interface Capabilities {
  webgl: boolean;
  /** Software rasteriser, ≤2 CPU cores, ≤2 GB memory or Save-Data. */
  lowPower: boolean;
}

interface NavigatorHints {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i;

function detect(): Capabilities {
  let webgl = false;
  let software = false;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl2") as WebGL2RenderingContext | null) ??
      (canvas.getContext("webgl") as WebGLRenderingContext | null);
    if (gl) {
      webgl = true;
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = String(
        gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "",
      );
      software = SOFTWARE_RENDERER.test(renderer);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    webgl = false;
  }
  const hints = navigator as Navigator & NavigatorHints;
  const lowPower =
    software ||
    (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 2) ||
    (typeof hints.deviceMemory === "number" && hints.deviceMemory <= 2) ||
    hints.connection?.saveData === true;
  return { webgl, lowPower };
}

let cached: Capabilities | null = null;

/** Detected once and cached; safe to call from effects and event handlers. */
export function getCapabilities(): Capabilities {
  cached ??= detect();
  return cached;
}

const snapshot = getCapabilities;

const subscribe = () => () => {};

/** Browser capabilities, detected once. `null` on the server and during hydration. */
export function useCapabilities(): Capabilities | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
