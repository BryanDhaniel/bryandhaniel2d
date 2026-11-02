import type { PaletteName } from "@/game/palette";

/**
 * The player character: colour ramps, sprite size and world scale, animation timings and the
 * rim and bounce lighting. Ramps run darkest to lightest and use palette names, except the
 * skin ramp, which lives here (as hex) so it can be changed without touching the palette.
 * After changing colours, run `npm run sprites` to re-export the atlas in public/.
 */
export const CHARACTER = {
  /** Fair skin from shadow to highlight. */
  skin: ["#c4887a", "#e2ad97", "#f5ceb9", "#fde8dc"],
  /** Hair ramp; the lightest tone is the cool sheen on the top block only. */
  hair: ["jet", "raven", "storm", "steel"],
  hoodie: ["coal", "carbon", "graphite", "pewter"],
  trousers: ["charcoal", "flint"],
  shoe: "soot",
  sole: "silver",
  /** Outer outline, and the lighter selective outline on the lit (upper-left) side. */
  outline: "void",
  litOutline: "steel",
  /** Drawstrings and catchlights. */
  accent: "chalk",
  /** The small laptop sticker on the left sleeve. */
  sticker: "violet",
  /** Portrait background, top and bottom bands. */
  portraitBackground: ["wheat", "sand"],

  /** Sprite frame size in pixels. */
  frame: { width: 16, height: 16 },
  /**
   * Sprite pixels per world unit. 16 matches every world texture and the villagers' cells, so
   * the frame is one unit square and the character stands one unit, hair to sole.
   */
  texelsPerUnit: 16,

  timings: {
    /** Seconds per idle (breathing) frame. */
    idleFrameSeconds: 0.6,
    /** Walk frames per second, and the speed-up while running. */
    walkFps: 10,
    runMultiplier: 1.45,
    /** Seconds per frame of the wave/nod played on reaching a doorway. */
    interactFrameSeconds: 0.24,
    /** How many times the two interact frames play. */
    interactLoops: 2,
  },

  /** A light edge on the side facing the sun or the nearest lamp, so black clothes keep shape. */
  rim: {
    enabled: true,
    /** Fraction of the light's colour added on lit edges. */
    strength: 0.2,
    /** Hard cap per colour channel (linear), so it reads as an edge, never a glow. */
    max: 0.26,
  },

  /** Warm bounce light on the hoodie's underside from the nearest lamp, lantern or fire. */
  bounce: {
    enabled: true,
    strength: 0.5,
    /** World units within which a light contributes. */
    radius: 4.5,
    max: 0.32,
  },
} as const satisfies {
  skin: readonly [string, string, string, string];
  hair: readonly [PaletteName, PaletteName, PaletteName, PaletteName];
  hoodie: readonly [PaletteName, PaletteName, PaletteName, PaletteName];
  trousers: readonly [PaletteName, PaletteName];
  shoe: PaletteName;
  sole: PaletteName;
  outline: PaletteName;
  litOutline: PaletteName;
  accent: PaletteName;
  sticker: PaletteName;
  portraitBackground: readonly [PaletteName, PaletteName];
  frame: { width: number; height: number };
  texelsPerUnit: number;
  timings: Record<string, number>;
  rim: { enabled: boolean; strength: number; max: number };
  bounce: { enabled: boolean; strength: number; radius: number; max: number };
};

/** World size of one sprite frame (the billboard). */
export const PLAYER_SIZE = {
  width: CHARACTER.frame.width / CHARACTER.texelsPerUnit,
  height: CHARACTER.frame.height / CHARACTER.texelsPerUnit,
} as const;
