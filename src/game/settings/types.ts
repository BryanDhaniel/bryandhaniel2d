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

export function isTimeMode(value: unknown): value is TimeMode {
  return typeof value === "string" && (TIME_MODES as readonly string[]).includes(value);
}

export function isWeatherKind(value: unknown): value is WeatherKind {
  return typeof value === "string" && (WEATHER_KINDS as readonly string[]).includes(value);
}

export function isQualitySetting(value: unknown): value is QualitySetting {
  return typeof value === "string" && (QUALITY_SETTINGS as readonly string[]).includes(value);
}
