export const SCENES = {
  boot: "boot",
  preload: "preload",
  world: "world",
} as const;

/** Render order. Characters, trees and buildings sort by their feet: ENTITY + y. */
export const DEPTH = {
  ground: 0,
  obstacles: 1,
  shadow: 5,
  marker: 6,
  entity: 10,
  night: 5000,
  lights: 5001,
  fireflies: 5002,
  emote: 5500,
  prompt: 6000,
} as const;

export const PLAYER = {
  speed: 72,
  runMultiplier: 1.6,
  /** Physics body at the feet, smaller than the sprite so 1-tile gaps are passable. */
  body: { width: 10, height: 6, offsetX: 3, offsetY: 10 },
} as const;

export const CAMERA = {
  lerp: 0.12,
  /** Aim for roughly this many world pixels on the short side (320x180 on a 1080p screen). */
  targetShortSide: 180,
  /** Beyond this many world pixels (or the world's own size) the view is letterboxed. */
  maxViewWidth: 480,
  maxViewHeight: 480,
} as const;

export const INTERACTION = {
  /** Horizontal reach either side of a door, and how far below it the porch extends. */
  doorReach: 20,
  porchDepth: 24,
} as const;
