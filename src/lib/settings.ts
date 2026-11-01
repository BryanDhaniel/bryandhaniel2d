import {
  isQualitySetting,
  isTimeMode,
  isWeatherKind,
  type QualitySetting,
  type TimeMode,
  type WeatherKind,
} from "@/game/settings/types";
import { STORAGE_KEYS, readFlag, readStorage } from "./storage";

/**
 * Low quality by default on touch devices, for reduced motion and on low-power hardware;
 * otherwise "auto", which starts at High and steps down if the frame rate drops.
 */
export function defaultQualityFor(options: {
  touch: boolean;
  reducedMotion: boolean;
  lowPower: boolean;
}): QualitySetting {
  return options.touch || options.reducedMotion || options.lowPower ? "low" : "auto";
}

export function storedTimeMode(value: string | null): TimeMode {
  return isTimeMode(value) ? value : "auto";
}

export function storedWeather(value: string | null): WeatherKind {
  return isWeatherKind(value) ? value : "clear";
}

export function storedQuality(value: string | null, fallback: QualitySetting): QualitySetting {
  return isQualitySetting(value) ? value : fallback;
}

export interface VillageSettings {
  timeMode: TimeMode;
  weather: WeatherKind;
  quality: QualitySetting;
  retro: boolean;
}

/** Reads the visitor's saved settings (with defaults) straight from localStorage. */
export function readVillageSettings(defaultQuality: QualitySetting): VillageSettings {
  return {
    timeMode: storedTimeMode(readStorage("local", STORAGE_KEYS.timeMode)),
    weather: storedWeather(readStorage("local", STORAGE_KEYS.weather)),
    quality: storedQuality(readStorage("local", STORAGE_KEYS.quality), defaultQuality),
    retro: readFlag("local", STORAGE_KEYS.retro, false),
  };
}
