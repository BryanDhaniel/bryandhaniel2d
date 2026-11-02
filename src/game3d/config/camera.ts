/**
 * Every tunable of the two camera modes: the isometric diorama view (the orthographic camera,
 * configured by CAMERA in visuals.ts) and the third-person view (a perspective camera on a
 * spring arm behind the player), plus the blended transition between them. The debug panel
 * (backquote) edits a live copy of the third-person values; copy what you like back here.
 *
 * Units: one world unit is one map tile (the player stands one unit tall). Angles are
 * degrees unless noted; rates are exponential smoothing rates per second (higher = snappier).
 */

export const THIRD_PERSON = {
  /** Vertical field of view, and the range the debug slider allows. */
  fov: 60,
  fovRange: [55, 65] as const,
  /** Length of the arm from the head pivot to the camera, and the range wheel/pinch allow. */
  armLength: 4.4,
  armRange: [2.2, 6.5] as const,
  /** The camera's starting pitch: 24 degrees on a 4.4-unit arm sits about 4 units behind and 1.8 above. */
  defaultPitch: 24,
  /** Pitch limits: negative looks up from below the head, positive looks down. */
  pitchMin: -15,
  pitchMax: 60,
  /** Sideways offset of camera and aim point (over the right shoulder). */
  shoulderOffset: 0.6,
  /** Height of the head pivot above the player's feet. */
  pivotHeight: 0.85,
  /** Look sensitivity: radians per pixel (mouse, touch) and radians per second (keys, sticks). */
  sensitivity: { mouse: 0.0042, touch: 0.0065, keys: 2.1, gamepad: 2.8 },
  /** Q / R turn the camera in steps of this many degrees. */
  turnStep: 45,
  damping: {
    /** Follow of the pivot (the player's head). */
    position: 12,
    yaw: 16,
    pitch: 14,
    /** How fast the arm grows back after a collision pulled it in. */
    armReturn: 3.5,
    fov: 5,
  },
  /** With prefers-reduced-motion: much less smoothing (a near-direct follow). */
  reducedMotionDamping: { position: 40, yaw: 45, pitch: 45, armReturn: 12, fov: 30 },
  /** Extra field of view while running (degrees). None with reduced motion. */
  runFovKick: 4,
  /** After this many seconds without look input while moving, swing back behind the player. */
  recenterDelay: 2,
  /** Speed of that swing (per second). */
  recenterRate: 1.4,
  collision: {
    /** Radius of the sphere swept along the arm, so the near plane never clips a wall. */
    radius: 0.24,
    /** The camera never gets nearer the pivot than this. */
    minDistance: 0.45,
    /** Keep at least this much air between the camera and the ground. */
    groundClearance: 0.25,
  },
  /** The player dithers out below this camera distance, down to `fadeMin` opacity. */
  fadeDistance: 1.2,
  fadeMin: 0.35,
  near: 0.05,
  far: 260,
  /** Character turn rate toward the movement direction (radians per second). */
  turnSpeed: 11,
} as const;

/** The blended switch between the two modes. */
export const CAMERA_TRANSITION = {
  seconds: 0.8,
  /**
   * The isometric view is approached through a narrow-angle perspective camera framed exactly
   * like it, then swapped for the real orthographic one, so the blend has no visible seam.
   */
  isoFov: 6,
} as const;
