import type { PaletteName } from "@/game/palette";
import type { DayPhase } from "@/game/settings/types";

/**
 * Every tunable of the visual systems lives here: render resolution, lighting, the day/night
 * cycle, shadows, post-processing, water, wind, weather and quality presets. Colours are
 * always palette names, so the look stays inside the 24-colour palette.
 */

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

export const RENDER = {
  /**
   * The world is drawn into a low-resolution canvas and upscaled with nearest-neighbour.
   * The integer zoom is chosen so the short side of the screen shows about this many world
   * pixels (320x180 on a 1080p screen, 180x370 on a phone held upright).
   */
  targetShortSide: 180,
  /** Beyond this many world pixels (or the world's own size) the view is letterboxed. */
  maxViewWidth: 480,
  maxViewHeight: 480,
  /**
   * Extra world pixels rendered around the view. The canvas is shifted by a fraction of a
   * texel each frame (in whole device pixels) so the camera glides smoothly while every
   * sprite stays locked to the pixel grid.
   */
  cameraMargin: 1,
  /** Camera follow smoothing per 60 Hz frame (0 = frozen, 1 = locked to the player). */
  cameraLerp: 0.12,
  cameraLerpReducedMotion: 0.35,
  /** How far above the player's feet the camera aims, in world pixels. */
  cameraFocusOffsetY: 8,
} as const;

// ---------------------------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------------------------

export const LIGHTING = {
  /** Size of the light array in the lit shader. Lights beyond this are culled by distance. */
  maxLights: 16,
  /** Reserved slots for the player's night light. */
  reservedSlots: 1,
  /** Light falloff is quantised into this many bands for a pixel-art look (0 = smooth). */
  bands: 6,
  /** Height of point lights above the ground, in world pixels; lower = more grazing light. */
  lightHeight: 22,
  /** Normal maps use the OpenGL convention (green = up). Set false for DirectX-style maps. */
  normalMapGreenUp: true,
  /** Lights whose circle doesn't reach within this many pixels of the view are skipped. */
  cullMargin: 24,
  /** Always-on lights (forge, screens) shine at this fraction of their strength by day. */
  daylightScale: 0.3,
} as const;

export type LightKind =
  "lamp" | "window" | "lantern" | "forge" | "monitor" | "neon" | "beacon" | "player" | "spark";

export interface LightStyle {
  color: PaletteName;
  /** Radius in world pixels. */
  radius: number;
  intensity: number;
  /** 0-1 random flicker amount. */
  flicker: number;
  /** Only shines between dusk and dawn. */
  nightOnly: boolean;
  /** On/off blink period in seconds (0 = steady). */
  blink: number;
}

export const LIGHT_STYLES: Record<LightKind, LightStyle> = {
  lamp: { color: "gold", radius: 72, intensity: 0.85, flicker: 0.05, nightOnly: true, blink: 0 },
  // Several windows and lanterns share a facade, so each adds only a soft pool.
  window: { color: "sun", radius: 30, intensity: 0.22, flicker: 0.02, nightOnly: true, blink: 0 },
  lantern: { color: "sun", radius: 40, intensity: 0.45, flicker: 0.1, nightOnly: true, blink: 0 },
  forge: { color: "ember", radius: 54, intensity: 1.0, flicker: 0.22, nightOnly: false, blink: 0 },
  monitor: { color: "sky", radius: 60, intensity: 0.55, flicker: 0.05, nightOnly: false, blink: 0 },
  neon: { color: "violet", radius: 48, intensity: 0.35, flicker: 0.03, nightOnly: true, blink: 0 },
  beacon: { color: "ember", radius: 16, intensity: 0.9, flicker: 0, nightOnly: false, blink: 1.4 },
  player: { color: "wheat", radius: 46, intensity: 0.35, flicker: 0, nightOnly: true, blink: 0 },
  spark: { color: "gold", radius: 30, intensity: 1.3, flicker: 0.3, nightOnly: false, blink: 0 },
};

// ---------------------------------------------------------------------------------------------
// Day / night cycle
// ---------------------------------------------------------------------------------------------

export type { DayPhase };

export interface TimeKeyframe {
  /** Time of day in [0, 1): 0 is midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset. */
  t: number;
  phase: DayPhase;
  /** Light2D ambient colour = palette colour x intensity. */
  ambient: PaletteName;
  ambientIntensity: number;
  /** Colour grading: blend toward `tint`, then saturation / contrast / brightness. */
  gradeTint: PaletteName;
  gradeStrength: number;
  saturation: number;
  contrast: number;
  brightness: number;
  /** Multipliers for bloom and vignette strength. */
  bloom: number;
  vignette: number;
  /** Background fog density (0-1); rain adds to it. */
  fog: number;
}

const NIGHT: Omit<TimeKeyframe, "t"> = {
  phase: "Night",
  ambient: "slate",
  ambientIntensity: 0.95,
  gradeTint: "deep",
  gradeStrength: 0.2,
  saturation: 0.75,
  contrast: 1.05,
  brightness: 1.0,
  bloom: 1.35,
  vignette: 1.35,
  fog: 0.3,
};

/** Sorted by t; the cycle wraps from the last keyframe back to the first. */
export const TIME_KEYFRAMES: readonly TimeKeyframe[] = [
  { t: 0, ...NIGHT },
  { t: 0.205, ...NIGHT },
  {
    t: 0.255,
    phase: "Dawn",
    ambient: "mist",
    ambientIntensity: 0.92,
    gradeTint: "ember",
    gradeStrength: 0.1,
    saturation: 0.92,
    contrast: 1.0,
    brightness: 1.02,
    bloom: 0.55,
    vignette: 1.1,
    fog: 0.5,
  },
  {
    t: 0.31,
    phase: "Day",
    ambient: "cloud",
    ambientIntensity: 1.02,
    gradeTint: "sun",
    gradeStrength: 0.05,
    saturation: 1.03,
    contrast: 1.0,
    brightness: 1.0,
    bloom: 0.12,
    vignette: 0.9,
    fog: 0.12,
  },
  {
    t: 0.5,
    phase: "Day",
    ambient: "cloud",
    ambientIntensity: 1.04,
    gradeTint: "cloud",
    gradeStrength: 0,
    saturation: 1.0,
    contrast: 1.03,
    brightness: 1.0,
    bloom: 0.06,
    vignette: 0.8,
    fog: 0,
  },
  {
    t: 0.685,
    phase: "Day",
    ambient: "cloud",
    ambientIntensity: 1.02,
    gradeTint: "sun",
    gradeStrength: 0.06,
    saturation: 1.03,
    contrast: 1.02,
    brightness: 1.0,
    bloom: 0.12,
    vignette: 0.9,
    fog: 0,
  },
  {
    t: 0.745,
    phase: "Dusk",
    ambient: "wheat",
    ambientIntensity: 0.92,
    gradeTint: "ember",
    gradeStrength: 0.18,
    saturation: 1.08,
    contrast: 1.05,
    brightness: 1.0,
    bloom: 0.6,
    vignette: 1.1,
    fog: 0.08,
  },
  {
    t: 0.79,
    phase: "Dusk",
    ambient: "violet",
    ambientIntensity: 0.8,
    gradeTint: "violet",
    gradeStrength: 0.14,
    saturation: 0.88,
    contrast: 1.04,
    brightness: 1.0,
    bloom: 1.1,
    vignette: 1.2,
    fog: 0.18,
  },
  { t: 0.84, ...NIGHT },
];

export const DAY_CYCLE = {
  /** Real seconds for one full day in "auto" mode. */
  lengthSeconds: 480,
  /** Where the clock starts on load (morning, so first impressions are in daylight). */
  startTime: 0.36,
  /** Fixed clock times for the "always day" and "always night" modes. */
  dayTime: 0.45,
  nightTime: 0.96,
  /** When switching modes the clock fast-forwards at this many days per second. */
  transitionSpeed: 0.3,
  /** Lamps and windows switch on over [lightsOnStart, lightsOnEnd] and off over the dawn pair. */
  lightsOnStart: 0.735,
  lightsOnEnd: 0.775,
  lightsOffStart: 0.235,
  lightsOffEnd: 0.27,
} as const;

// ---------------------------------------------------------------------------------------------
// Sun and shadows
// ---------------------------------------------------------------------------------------------

export const SUN = {
  /** The sun rises in the east at `rise` and sets in the west at `set` (times of day). */
  rise: 0.25,
  set: 0.77,
  /**
   * Shadows are pre-baked at this many sun positions between sunrise and sunset, so they stay
   * pixel-crisp. Odd numbers give a noon frame.
   */
  steps: 7,
  /** Shadow length as a fraction of the caster's height: noon and horizon. */
  minLength: 0.3,
  maxLength: 0.85,
  /** Horizontal shear at sunrise/sunset (shadow tip offset per pixel of height). */
  maxShear: 0.95,
  /** Peak shadow opacity, reached mid-morning to mid-afternoon. */
  maxAlpha: 0.32,
  /** Fade window (time of day) after sunrise and before sunset. */
  fade: 0.045,
} as const;

export const SHADOWS = {
  /** Blob shadow under characters. */
  blobAlpha: 0.32,
  /** Soft ambient occlusion along building bases and under trees. */
  aoAlpha: 0.3,
  /** Characters within this distance of a lit lamp get a contact shadow pointing away from it. */
  contactRadius: 70,
  contactAlpha: 0.42,
  contactOffset: 4,
} as const;

// ---------------------------------------------------------------------------------------------
// Post-processing
// ---------------------------------------------------------------------------------------------

export const POST = {
  /**
   * Luminance above which pixels contribute to bloom (0-1). Daylit surfaces stay under it
   * because bloom strength also follows the clock (see TIME_KEYFRAMES.bloom); at night only
   * lamps, lit windows and screens are bright enough.
   */
  bloomThreshold: 0.8,
  /** Soft knee around the threshold. */
  bloomKnee: 0.1,
  bloomStrength: 0.7,
  /** Blur radius of the bloom, in half-resolution texels. */
  bloomRadius: 1.25,
  vignetteStrength: 0.34,
  /** The vignette is quantised into this many ordered-dither levels. */
  vignetteLevels: 6,
} as const;

export const RETRO = {
  /** Film grain amplitude. */
  grain: 0.05,
  /** Darkening of alternate texel rows. */
  scanlines: 0.035,
  /** Horizontal red/blue offset in whole texels (CRT convergence error). */
  aberration: 1,
  /** Slow rolling brightness band. */
  roll: 0.02,
} as const;

// ---------------------------------------------------------------------------------------------
// Water, wind and weather
// ---------------------------------------------------------------------------------------------

export const WATER = {
  /** How strongly buildings and characters reflect in water (0-1). */
  reflectionStrength: 0.34,
  /**
   * Reflections fade out this many pixels from the shoreline. Long enough that buildings
   * across the road (about four tiles up) still show in the ponds.
   */
  reflectionReach: 72,
  /** Horizontal wobble of reflections, in whole texels. */
  wobble: 1,
  rippleSpeed: 2.2,
  /** Per-texel chance threshold for a specular sparkle (closer to 1 = rarer). */
  sparkle: 0.993,
  /** Pixels at the edge of water tiles treated as shore (no reflection). */
  shoreInset: 3,
  /** Puddles placed on paths while it rains. */
  puddles: 18,
  puddleShine: 0.4,
  /** Tile-frame animation interval for water. */
  frameMs: 450,
} as const;

export const WIND = {
  /** Sway at the top of trees and grass, in world pixels (quantised to whole pixels). */
  amplitude: 1.4,
  speed: 1.25,
  /** Strength of the secondary gust wave. */
  gust: 0.45,
  /** Fraction of grass tiles that get a swaying tuft. */
  tuftDensity: 0.32,
} as const;

export const WEATHER = {
  rain: {
    dropsPerSecond: 170,
    /** Fall speed in world pixels per second, and horizontal drift per pixel fallen. */
    speed: 240,
    slant: 0.22,
    splashesPerSecond: 34,
    /** Ambient brightness multiplier while raining. */
    dim: 0.82,
    /** Seconds to fade rain in or out. */
    fade: 2.5,
  },
  fog: {
    alpha: 0.42,
    /** Fog density added while it rains. */
    rain: 0.38,
    /** Drift speed in world pixels per second. */
    drift: 5,
  },
  fireflies: {
    count: 16,
  },
} as const;

// ---------------------------------------------------------------------------------------------
// Buildings and environment
// ---------------------------------------------------------------------------------------------

export const ROOF = {
  /** Roof opacity while the player stands at the door or walks behind the building. */
  fadedAlpha: 0.3,
  /** Fade speed, in alpha per second. */
  fadeSpeed: 5,
} as const;

// ---------------------------------------------------------------------------------------------
// Quality
// ---------------------------------------------------------------------------------------------

export const QUALITY = {
  auto: {
    /** Ignore the first frames while textures upload and shaders compile. */
    warmupMs: 2000,
    /** Average FPS is measured over windows of this length. */
    windowMs: 2500,
    /** Step down a level when a window averages below this. */
    minFps: 50,
    /** Stop measuring after this many good windows in a row. */
    stableWindows: 2,
    /** Frames longer than this (ms) are stalls, not slowness, and restart the window. */
    stallMs: 100,
  },
  /** Below this FPS for several seconds, the plain view is offered. */
  plainOfferFps: 30,
} as const;
