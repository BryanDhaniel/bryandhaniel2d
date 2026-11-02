import type { PaletteName } from "@/game/palette";
import type { DayPhase, QualityLevel } from "@/game/settings/types";

/**
 * Every tunable of the 3D village in one place: world scale, camera, movement, the sun and
 * the day/night keyframes, shadows, point lights, colour grades, post-processing, Pixel
 * mode, water, wind, weather and the quality tiers. Colours are always palette names, so the
 * whole look stays inside the 32-colour palette in src/game/palette.ts.
 *
 * Units: one world unit is one map tile. Angles are degrees unless noted.
 */

// ---------------------------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------------------------

export const WORLD = {
  /** Texture pixels per world unit. Every generated texture uses this density. */
  texelsPerUnit: 16,
  /** Heights of the terrain steps. */
  plazaHeight: 0.3,
  forestHeight: 0.55,
  waterLevel: -0.16,
  waterBed: -0.6,
  bridgeDeck: 0.14,
  /** How far the diorama's earth skirt drops below the ground. */
  baseDepth: 2.4,
} as const;

/**
 * The land around the village, seen from the third-person view (the isometric view keeps the
 * floating diorama): a forested shelf, rolling hills, a ring of cliffs, a lake, a tree line and
 * a band of distant mountains, all fading into the distance fog.
 */
export const HORIZON = {
  /** Flat forest floor around the map before the hills start (units). */
  shelf: 3,
  hillHeight: 3.4,
  cliffStart: 30,
  cliffHeight: 10,
  /** How far the land mesh reaches beyond the map, and its grid step. */
  extent: 78,
  step: 1.5,
  lake: { x: 50, z: 47, radiusX: 13, radiusZ: 8.5 },
  /** Instanced trees on the shelf and hills (they also hide the village's edge). */
  trees: 520,
  treeDepth: 26,
  /** Distant mountains: a ring of low-poly peaks and a farther silhouette band. */
  mountains: { radius: 150, peaks: 28, height: [18, 42] as const },
  backdrop: { radius: 210, height: 26 },
} as const;

// ---------------------------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------------------------

export const CAMERA = {
  /** Fixed orthographic view: tilt below the horizon and the starting turn around the map. */
  pitch: 35,
  yaw: 45,
  /** Distance from the focus point (orthographic, so it only affects clipping and fog). */
  distance: 60,
  near: 1,
  far: 140,
  /** World units visible across the short side of the screen at zoom 1. */
  unitsOnShortSide: 12.5,
  minZoom: 0.7,
  maxZoom: 1.8,
  /** Zoom change per wheel pixel and per +/- key press. */
  wheelStep: 0.0015,
  keyStep: 0.15,
  /** Exponential smoothing rates (per second) for following the player and zooming. */
  followRate: 6,
  zoomRate: 10,
  /** Q / R snap rotations of 90 degrees take this long (eased). */
  rotateSeconds: 0.55,
  /** The focus point stays this far inside the map edges. */
  boundsMargin: 3,
  /** The camera aims this far above the player's feet. */
  focusHeight: 0.6,
} as const;

// ---------------------------------------------------------------------------------------------
// Movement and characters
// ---------------------------------------------------------------------------------------------

export const MOVE = {
  walkSpeed: 3.1,
  runMultiplier: 1.7,
  /** Collision radius of the player. */
  radius: 0.27,
  /** How quickly the feet follow steps up and down (per second). */
  heightRate: 14,
  /** Tile steps (curbs, the plaza, the bridge) blend over this width, so feet climb them. */
  ramp: 0.22,
  /** Drops deeper than this are falls (gravity); smaller ones are stepped down. */
  snapDistance: 0.4,
  gravity: 22,
  /** The optional short jump (Space): take-off speed, about 0.6 units high. */
  jumpSpeed: 5.2,
  npcSpeed: 1.1,
} as const;

/** Doorways you can use: within range, and (in third-person) inside the view cone. */
export const INTERACT = {
  range: 2.4,
  /** Half-angle of the view cone (degrees) around the camera's ground direction. */
  cone: 62,
} as const;

export const SPRITES = {
  /** Villager, cat and bird cells are 16x16 pixels, one unit tall (the player: config/character.ts). */
  cell: 16,
  walkFps: 8,
  /** Lighting normal of billboards (local space, +z faces the camera): tilted up a little. */
  normal: [0, 0.55, 0.84] as const,
  /** Alpha cut-off shared by the colour and shadow materials. */
  alphaTest: 0.5,
} as const;

// ---------------------------------------------------------------------------------------------
// Sun, sky and the day/night cycle
// ---------------------------------------------------------------------------------------------

export type GradeName = "dawn" | "day" | "dusk" | "night";
export const GRADE_NAMES: readonly GradeName[] = ["dawn", "day", "dusk", "night"];

export interface LightingKeyframe {
  /** Time of day in [0, 1): 0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset. */
  t: number;
  phase: DayPhase;
  /** The key light: the sun by day and the moon by night. */
  sun: { elevation: number; azimuth: number; color: PaletteName; intensity: number };
  hemisphere: { sky: PaletteName; ground: PaletteName; intensity: number };
  sky: { top: PaletteName; horizon: PaletteName };
  fog: { color: PaletteName; density: number };
  /** Tone-mapping exposure. */
  exposure: number;
  /** Strength of the gradient environment light. */
  environment: number;
  grade: GradeName;
  /** Multiplier on the bloom intensity (lamps glow harder at night). */
  bloom: number;
  /** Strength of the moving cloud shadows (0 at night). */
  clouds: number;
  /** Light shafts near the sun (strongest at golden hour). */
  shafts: number;
  stars: number;
}

const NIGHT: Omit<LightingKeyframe, "t"> = {
  phase: "Night",
  sun: { elevation: 50, azimuth: 215, color: "frost", intensity: 0.5 },
  hemisphere: { sky: "slate", ground: "night", intensity: 0.42 },
  sky: { top: "ink", horizon: "night" },
  fog: { color: "night", density: 0.012 },
  exposure: 1.45,
  environment: 0.18,
  grade: "night",
  bloom: 1.25,
  clouds: 0,
  shafts: 0,
  stars: 1,
};

const NOON: Omit<LightingKeyframe, "t"> = {
  phase: "Day",
  sun: { elevation: 60, azimuth: 180, color: "cloud", intensity: 2.7 },
  hemisphere: { sky: "sky", ground: "grass", intensity: 0.75 },
  sky: { top: "sky", horizon: "foam" },
  fog: { color: "mist", density: 0.006 },
  exposure: 1,
  environment: 0.55,
  grade: "day",
  bloom: 0.55,
  clouds: 0.55,
  shafts: 0.25,
  stars: 0,
};

/** Keyframes in time order; the cycle blends between neighbours with a smoothstep. */
export const TIME_KEYFRAMES: readonly LightingKeyframe[] = [
  { t: 0, ...NIGHT },
  { t: 0.2, ...NIGHT },
  {
    t: 0.255,
    phase: "Dawn",
    sun: { elevation: 6, azimuth: 96, color: "ember", intensity: 1 },
    hemisphere: { sky: "rose", ground: "plum", intensity: 0.5 },
    sky: { top: "violet", horizon: "sun" },
    fog: { color: "rose", density: 0.026 },
    exposure: 1.2,
    environment: 0.35,
    grade: "dawn",
    bloom: 0.85,
    clouds: 0.2,
    shafts: 0.9,
    stars: 0.15,
  },
  {
    t: 0.31,
    ...NOON,
    sun: { elevation: 26, azimuth: 115, color: "wheat", intensity: 2.3 },
    shafts: 0.55,
  },
  { t: 0.5, ...NOON },
  {
    t: 0.69,
    ...NOON,
    sun: { elevation: 26, azimuth: 245, color: "wheat", intensity: 2.3 },
    shafts: 0.55,
  },
  {
    t: 0.745,
    phase: "Dusk",
    sun: { elevation: 6, azimuth: 264, color: "sun", intensity: 1.1 },
    hemisphere: { sky: "violet", ground: "plum", intensity: 0.5 },
    sky: { top: "plum", horizon: "ember" },
    fog: { color: "rose", density: 0.022 },
    exposure: 1.15,
    environment: 0.35,
    grade: "dusk",
    bloom: 0.95,
    clouds: 0.25,
    shafts: 1,
    stars: 0.1,
  },
  {
    t: 0.79,
    phase: "Dusk",
    sun: { elevation: 22, azimuth: 250, color: "violet", intensity: 0.35 },
    hemisphere: { sky: "slate", ground: "night", intensity: 0.42 },
    sky: { top: "night", horizon: "plum" },
    fog: { color: "plum", density: 0.016 },
    exposure: 1.35,
    environment: 0.22,
    grade: "dusk",
    bloom: 1.15,
    clouds: 0,
    shafts: 0,
    stars: 0.6,
  },
  { t: 0.84, ...NIGHT },
];

export const DAY_CYCLE = {
  /** Real seconds for one full day in "Cycle" mode. */
  lengthSeconds: 480,
  /** The clock starts mid-morning so first impressions are in daylight. */
  startTime: 0.36,
  /** Fixed clock times for "always day" and "always night". */
  dayTime: 0.45,
  nightTime: 0.96,
  /** Switching modes fast-forwards the clock at this many days per second. */
  transitionSpeed: 0.3,
  /** Lamps and windows fade on over [lightsOnStart, lightsOnEnd] and off over the dawn pair. */
  lightsOnStart: 0.735,
  lightsOnEnd: 0.775,
  lightsOffStart: 0.235,
  lightsOffEnd: 0.27,
  /** The key light never drops below this elevation, so shadows never point the wrong way. */
  minElevation: 8,
} as const;

export const SUN = {
  /** Shadow-map frustum: padding around the visible ground and the light's distance. */
  frustumPadding: 3,
  /** The frustum half-size is rounded up to this step, so zooming doesn't shimmer. */
  frustumStep: 2,
  /** Half-size of the single shadow map around the player in perspective views. */
  perspectiveHalf: 20,
  /** Cascaded shadows (third-person on High): how many, how far they reach, and how far behind the camera casters still count. */
  cascades: 3,
  cascadeFar: 70,
  cascadeMargin: 40,
  distance: 50,
  bias: -0.0004,
  normalBias: 0.035,
  /** PCF filter radius (soft edges). */
  radius: 2.5,
} as const;

export const CLOUDS = {
  /** World units per noise tile, and drift speed in units per second. */
  scale: 22,
  speed: [0.35, 0.18] as const,
  /** Darkest cloud shadow at full strength. */
  strength: 0.42,
} as const;

/** Height fog: thicker near the ground and further from the camera. */
export const FOG = {
  /** Depth (from the camera) where fog starts. The camera sits CAMERA.distance away. */
  depthStart: 44,
  /** In third-person: fog starts this far out and thickens by this factor, hiding the edge. */
  thirdPersonStart: 16,
  thirdPersonDensity: 2.4,
  heightBase: 0,
  heightFalloff: 0.55,
} as const;

/** The third-person sky dome (inside the camera's far plane) and its cloud layer. */
export const SKY_DOME = {
  radius: 200,
  /** Haze strength along the horizon (0-1). */
  haze: 0.55,
  /** Height of the cloud layer the dome samples (the ground's cloud shadows line up with it). */
  cloudHeight: 55,
} as const;

// ---------------------------------------------------------------------------------------------
// Point lights and emissives
// ---------------------------------------------------------------------------------------------

export type LightKind = "lamp" | "window" | "lantern" | "forge" | "monitor" | "fire";

export interface LightStyle {
  color: PaletteName;
  intensity: number;
  /** Range in world units (PointLight.distance). */
  distance: number;
  /** Random flicker amplitude (fraction of intensity). */
  flicker: number;
  /** Only shines while the lamps are on (otherwise it is dimmed by day). */
  nightOnly: boolean;
}

export const LIGHT_STYLES: Record<LightKind, LightStyle> = {
  lamp: { color: "gold", intensity: 5, distance: 5.5, flicker: 0.04, nightOnly: true },
  window: { color: "sun", intensity: 2.2, distance: 3.5, flicker: 0.02, nightOnly: true },
  lantern: { color: "sun", intensity: 3.4, distance: 4.5, flicker: 0.08, nightOnly: true },
  forge: { color: "ember", intensity: 5.5, distance: 5, flicker: 0.22, nightOnly: false },
  monitor: { color: "sky", intensity: 2.6, distance: 4, flicker: 0.06, nightOnly: false },
  fire: { color: "sun", intensity: 4.5, distance: 5, flicker: 0.18, nightOnly: true },
};

export const LIGHTS = {
  /** Point lights are pooled: the nearest sources to the camera get a light each frame. */
  decay: 1.6,
  /** Day-time strength of lights that also shine by day (forge, monitors). */
  daylightScale: 0.35,
  /** Lights further than this from the camera focus are never assigned. */
  cullDistance: 18,
  shadowMapSize: 256,
  shadowBias: -0.004,
} as const;

/** Emissive strength of glowing surfaces at night (by day they keep `emissiveDay`). */
export const EMISSIVE = {
  window: 3.2,
  lamp: 5,
  monitor: 3.6,
  led: 4,
  forge: 4.5,
  emissiveDay: 0.15,
} as const;

// ---------------------------------------------------------------------------------------------
// Colour grades (procedural 3D LUTs, replaceable by .cube files)
// ---------------------------------------------------------------------------------------------

export interface GradeParams {
  /** Warm (+) or cool (-) white balance. */
  temperature: number;
  saturation: number;
  contrast: number;
  /** Shadows are lifted toward this colour... */
  lift: { color: PaletteName; amount: number };
  /** ...and highlights tinted toward this one. */
  gain: { color: PaletteName; amount: number };
}

export const GRADES: Record<GradeName, GradeParams> = {
  dawn: {
    temperature: 0.14,
    saturation: 1.06,
    contrast: 1.04,
    lift: { color: "plum", amount: 0.06 },
    gain: { color: "wheat", amount: 0.08 },
  },
  day: {
    temperature: 0.03,
    saturation: 1.1,
    contrast: 1.06,
    lift: { color: "deep", amount: 0.03 },
    gain: { color: "cloud", amount: 0.03 },
  },
  dusk: {
    temperature: 0.22,
    saturation: 1.14,
    contrast: 1.06,
    lift: { color: "plum", amount: 0.09 },
    gain: { color: "sun", amount: 0.1 },
  },
  night: {
    temperature: -0.18,
    saturation: 0.82,
    contrast: 1.08,
    lift: { color: "deep", amount: 0.07 },
    gain: { color: "frost", amount: 0.04 },
  },
};

export const LUT_SIZE = 32;

// ---------------------------------------------------------------------------------------------
// Post-processing and Pixel mode
// ---------------------------------------------------------------------------------------------

export const POST = {
  /** Bloom runs on the HDR image before exposure: only emissive surfaces exceed 1. */
  bloomThreshold: 1,
  bloomSmoothing: 0.25,
  bloomIntensity: 1.1,
  bloomRadius: 0.72,
  vignetteOffset: 0.3,
  vignetteDarkness: 0.42,
  /** Tilt-shift: a horizontal band through the screen centre (where the player is). */
  tiltFocusArea: 0.62,
  tiltFeather: 0.38,
  /**
   * Screen-space ambient occlusion (High): sampling radius as a fraction of the screen,
   * strength, the camera distance it fades out beyond and the proximity range (world units).
   */
  aoRadius: 0.06,
  aoIntensity: 2.4,
  aoDistance: 90,
  aoFalloff: 0.8,
  aberrationOffset: 0.0014,
  grainOpacity: 0.09,
  /**
   * Third-person retune: the sky fills much of the low view, so bloom, exposure and the
   * vignette ease off as the camera comes down (multipliers at full third-person).
   */
  thirdPersonBloom: 0.72,
  thirdPersonExposure: 0.94,
  thirdPersonVignette: 0.3,
  /** Depth of field on the player (High, third-person): a soft, subtle falloff. */
  dofRange: 5,
  dofBokehScale: 1.4,
} as const;

export const PIXEL_MODE = {
  /** The low-resolution buffer is never taller than this; the upscale factor is an integer. */
  maxHeight: 720,
  minScale: 2,
  /** Edge detection on the low-resolution depth (world units of depth difference). */
  outlineDepth: 0.45,
  outlineColor: "ink" as PaletteName,
  outlineStrength: 0.7,
} as const;

// ---------------------------------------------------------------------------------------------
// Water, wind, weather and ambience
// ---------------------------------------------------------------------------------------------

export const WATER = {
  shallow: "teal" as PaletteName,
  deep: "deep" as PaletteName,
  foam: "foam" as PaletteName,
  /** Distance-to-shore texture resolution (texels per tile). */
  shoreResolution: 8,
  /** Tiles from the shore at which the water reaches its deep colour. */
  depthReach: 2.2,
  foamWidth: 0.16,
  rippleSpeed: 0.9,
  rippleScale: 2.4,
  sparkle: 0.985,
  reflectionStrength: 0.42,
  /** Size of the planar reflection render target (High). */
  reflectionSize: 512,
  distortion: 0.035,
} as const;

export const WIND = {
  /** Sway at the tips of grass, leaves, banners and signs (world units). */
  amplitude: 0.06,
  speed: 1.4,
  gust: 0.5,
} as const;

export const WEATHER = {
  rain: {
    drops: { light: 700, full: 1800 },
    splashes: { light: 0, full: 160 },
    /** Box around the camera focus where it rains. */
    area: 26,
    height: 14,
    speed: 16,
    slant: 0.18,
    /** How quickly surfaces get wet and dry (per second). */
    wetRate: 0.12,
    dryRate: 0.05,
    /** Sunlight multiplier while it rains. */
    dim: 0.55,
  },
  fogBanks: { count: { light: 4, full: 9 }, alpha: 0.22, drift: 0.25, rainBoost: 0.5 },
  fireflies: { count: { light: 18, full: 40 } },
  dust: { count: { light: 60, full: 140 } },
  smokePuffs: 10,
  sparks: 26,
  /** Volumetric cones under lamps at night (High). */
  coneAlpha: 0.12,
  shaftAlpha: 0.08,
} as const;

/** Close-up ground detail in third-person (see scene/GroundDetail.tsx). */
export const GROUND_DETAIL = {
  /** Size of the dense grass pool and the radius it is planted in, per quality level. */
  grass: { low: 0, medium: 700, high: 1500 } satisfies Record<QualityLevel, number>,
  radius: { low: 0, medium: 8, high: 11 } satisfies Record<QualityLevel, number>,
  /** Planting grid step and the share of grassy cells that get a tuft. */
  cell: 0.5,
  density: 0.55,
  puddles: 26,
  particles: 48,
  /** Footstep particle size (world units) and lifetime (seconds). */
  particleSize: 0.09,
  particleLife: 0.45,
} as const;

/** Third-person building markers: hidden at the door, fading in, then out with distance. */
export const WAYPOINTS = {
  hideWithin: 2.5,
  fadeIn: 3,
  fadeOut: 36,
  /** Height of the marker above the building's highest point. */
  lift: 0.7,
} as const;

/** Roof and front-wall cutaway when the player stands in a doorway. */
export const CUTAWAY = {
  opacity: 0.25,
  rate: 7,
} as const;

// ---------------------------------------------------------------------------------------------
// Quality tiers
// ---------------------------------------------------------------------------------------------

export interface TierFeatures {
  maxDpr: number;
  /** Real-time sun shadows (otherwise only blob shadows under characters). */
  sunShadows: boolean;
  shadowMapSize: number;
  /** Cascaded sun shadows in third-person (otherwise one map fitted around the player). */
  cascadedShadows: boolean;
  /** Third-person: depth of field focused on the player (replaces the diorama's tilt-shift). */
  depthOfField: boolean;
  /** How far (world units) the third-person camera draws small props, grass and far trees. */
  drawDistance: number;
  /** Post stack beyond tone mapping (bloom, grade, vignette). */
  post: boolean;
  tiltShift: boolean;
  ssao: boolean;
  reflections: boolean;
  shafts: boolean;
  cones: boolean;
  weather: "off" | "light" | "full";
  /** Pooled point lights, and how many of them cast shadows. */
  lightPool: number;
  shadowLights: number;
  clouds: boolean;
  multisampling: number;
}

export const QUALITY_TIERS: Record<QualityLevel, TierFeatures> = {
  low: {
    maxDpr: 1,
    sunShadows: false,
    shadowMapSize: 0,
    cascadedShadows: false,
    depthOfField: false,
    drawDistance: 26,
    post: false,
    tiltShift: false,
    ssao: false,
    reflections: false,
    shafts: false,
    cones: false,
    weather: "off",
    lightPool: 4,
    shadowLights: 0,
    clouds: false,
    multisampling: 0,
  },
  medium: {
    maxDpr: 1.5,
    sunShadows: true,
    shadowMapSize: 1024,
    cascadedShadows: false,
    depthOfField: false,
    drawDistance: 42,
    post: true,
    tiltShift: false,
    ssao: false,
    reflections: false,
    shafts: false,
    cones: false,
    weather: "light",
    lightPool: 8,
    shadowLights: 0,
    clouds: true,
    multisampling: 2,
  },
  high: {
    maxDpr: 2,
    sunShadows: true,
    shadowMapSize: 2048,
    cascadedShadows: true,
    depthOfField: true,
    drawDistance: 70,
    post: true,
    tiltShift: true,
    ssao: true,
    reflections: true,
    shafts: true,
    cones: true,
    weather: "full",
    lightPool: 12,
    shadowLights: 1,
    clouds: true,
    multisampling: 4,
  },
};

export const QUALITY = {
  /** Auto starts here and lets the performance monitor step up or down. */
  autoStart: "medium" as QualityLevel,
  /** drei PerformanceMonitor: FPS bounds per refresh rate, and how many flip-flops to allow. */
  bounds60: [45, 58] as const,
  boundsHigh: [55, 100] as const,
  flipflops: 4,
  /** Below this FPS on Low for `lowFpsSeconds`, the plain view is offered. */
  plainOfferFps: 30,
  lowFpsSeconds: 6,
} as const;
