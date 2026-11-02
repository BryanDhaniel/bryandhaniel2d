/**
 * Visitor-facing settings shared by the HUD and the game. Dependency-free so the React UI can
 * import them without pulling Phaser into the page bundle.
 */

export type TimeMode = "auto" | "day" | "night";
export const TIME_MODES: readonly TimeMode[] = ["auto", "day", "night"];

export type WeatherKind = "clear" | "rain";
export const WEATHER_KINDS: readonly WeatherKind[] = ["clear", "rain"];

export type QualityLevel = "low" | "medium" | "high";
export type QualitySetting = QualityLevel | "auto";
export const QUALITY_SETTINGS: readonly QualitySetting[] = ["auto", "low", "medium", "high"];

export type DayPhase = "Night" | "Dawn" | "Day" | "Dusk";

/** The diorama view from above, or a camera behind the player's back. */
export type CameraMode = "isometric" | "thirdPerson";
export const CAMERA_MODES: readonly CameraMode[] = ["isometric", "thirdPerson"];

/** Visitor options for the third-person camera. */
export interface CameraOptions {
  invertY: boolean;
  /** Swing back behind the player after a moment without look input. */
  autoRecenter: boolean;
  /** Capture the mouse for looking (Esc releases it) instead of click-and-drag. */
  pointerLock: boolean;
  /** Space jumps. */
  jump: boolean;
}

/** Live third-person and shadow tunables edited by the debug panel (backquote). */
export interface CameraTuning {
  fov: number;
  armLength: number;
  shoulderOffset: number;
  /** Follow and rotation smoothing rates (per second). */
  positionDamping: number;
  rotationDamping: number;
  shadowBias: number;
  shadowNormalBias: number;
  /** Draws the camera and movement colliders. */
  showColliders: boolean;
}

export function isCameraMode(value: unknown): value is CameraMode {
  return typeof value === "string" && (CAMERA_MODES as readonly string[]).includes(value);
}

export function isTimeMode(value: unknown): value is TimeMode {
  return typeof value === "string" && (TIME_MODES as readonly string[]).includes(value);
}

export function isWeatherKind(value: unknown): value is WeatherKind {
  return typeof value === "string" && (WEATHER_KINDS as readonly string[]).includes(value);
}

export function isQualitySetting(value: unknown): value is QualitySetting {
  return typeof value === "string" && (QUALITY_SETTINGS as readonly string[]).includes(value);
}
