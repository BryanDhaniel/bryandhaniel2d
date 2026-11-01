export const SCENES = {
  boot: "boot",
  preload: "preload",
  world: "world",
} as const;

/**
 * Render order. Characters, trees, props and buildings sort by their feet: ENTITY + y.
 * Visual tunables (camera, lighting, effects) live in config/visuals.ts.
 */
export const DEPTH = {
  ground: 0,
  obstacles: 1,
  shadow: 5,
  marker: 8,
  entity: 10,
  fog: 4900,
  weather: 4950,
  fireflies: 5000,
  emote: 5500,
} as const;

export const PLAYER = {
  speed: 72,
  runMultiplier: 1.6,
  /** Physics body at the feet, smaller than the sprite so 1-tile gaps are passable. */
  body: { width: 10, height: 6, offsetX: 3, offsetY: 10 },
} as const;

export const INTERACTION = {
  /** Horizontal reach either side of a door, and how far below it the porch extends. */
  doorReach: 20,
  porchDepth: 24,
} as const;
