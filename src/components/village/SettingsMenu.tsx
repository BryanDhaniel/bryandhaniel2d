"use client";

import { useEffect, useId, useRef, useState } from "react";
import type {
  CameraOptions,
  QualityLevel,
  QualitySetting,
  TimeMode,
  WeatherKind,
} from "@/game/settings/types";
import { PixelIcon } from "@/components/PixelIcon";

interface Option<T extends string> {
  value: T;
  label: string;
}

const TIME_OPTIONS: readonly Option<TimeMode>[] = [
  { value: "auto", label: "Cycle" },
  { value: "day", label: "Day" },
  { value: "night", label: "Night" },
];

const WEATHER_OPTIONS: readonly Option<WeatherKind>[] = [
  { value: "clear", label: "Clear" },
  { value: "rain", label: "Rain" },
];

const QUALITY_OPTIONS: readonly Option<QualitySetting>[] = [
  { value: "auto", label: "Auto" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
];

const LEVEL_LABELS: Record<QualityLevel, string> = { low: "Low", medium: "Medium", high: "High" };

function RadioGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  hint,
}: {
  legend: string;
  name: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  hint?: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm tracking-wide text-slate uppercase">{legend}</legend>
      <div className="flex gap-1">
        {options.map((option) => (
          <label key={option.value} className="flex-1 cursor-pointer">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span className="block border-2 border-ink bg-cloud px-1 py-1.5 text-center text-sm text-ink peer-checked:bg-gold peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-violet hover:bg-wheat peer-checked:hover:bg-gold">
              {option.label}
            </span>
          </label>
        ))}
      </div>
      {hint ? <p className="mt-1 text-xs text-slate">{hint}</p> : null}
    </fieldset>
  );
}

interface SettingsMenuProps {
  timeMode: TimeMode;
  weather: WeatherKind;
  quality: QualitySetting;
  qualityLevel: QualityLevel | null;
  pixelMode: boolean;
  grain: boolean;
  aberration: boolean;
  onTimeMode: (mode: TimeMode) => void;
  onWeather: (kind: WeatherKind) => void;
  onQuality: (setting: QualitySetting) => void;
  onVisualOptions: (options: { pixelMode: boolean; grain: boolean; aberration: boolean }) => void;
  camera: CameraOptions;
  onCameraOptions: (options: CameraOptions) => void;
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="grid size-6 shrink-0 place-items-center border-2 border-ink bg-cloud peer-checked:bg-gold peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-violet"
      >
        {checked ? <PixelIcon name="close" size={10} /> : null}
      </span>
      <span className="text-sm">{label}</span>
    </label>
  );
}

/**
 * Disclosure with the visual settings. Escape or clicking outside closes it. The panel is
 * positioned against the HUD's button row (its nearest positioned ancestor) rather than the
 * gear, so on a narrow phone it lines up with the screen edge instead of spilling off the left.
 */
export function SettingsMenu({
  timeMode,
  weather,
  quality,
  qualityLevel,
  pixelMode,
  grain,
  aberration,
  onTimeMode,
  onWeather,
  onQuality,
  onVisualOptions,
  camera,
  onCameraOptions,
}: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const nameId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    panelRef.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const effective = qualityLevel ? LEVEL_LABELS[qualityLevel] : null;
  const qualityHint =
    quality === "auto" && effective
      ? `Auto is using ${effective}.`
      : "Low: no shadows or effects. High: everything.";
  const visual = { pixelMode, grain, aberration };

  return (
    <div
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Village settings"
        title="Village settings"
        onClick={() => setOpen((value) => !value)}
        className="pixel-button size-11 bg-cloud text-ink hover:bg-wheat aria-expanded:bg-wheat"
      >
        <PixelIcon name="gear" size={20} />
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label="Village settings"
          className="absolute top-full right-0 z-40 mt-3 max-h-[calc(100vh-8rem)] w-72 max-w-[calc(100vw-1.5rem)] space-y-4 overflow-y-auto p-4 pixel-panel"
        >
          <RadioGroup
            legend="Time of day"
            name={`${nameId}-time`}
            options={TIME_OPTIONS}
            value={timeMode}
            onChange={onTimeMode}
          />
          <RadioGroup
            legend="Weather"
            name={`${nameId}-weather`}
            options={WEATHER_OPTIONS}
            value={weather}
            onChange={onWeather}
            hint={qualityLevel === "low" ? "Weather shows on Medium and High." : undefined}
          />
          <RadioGroup
            legend="Graphics"
            name={`${nameId}-quality`}
            options={QUALITY_OPTIONS}
            value={quality}
            onChange={onQuality}
            hint={qualityHint}
          />
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm tracking-wide text-slate uppercase">Effects</legend>
            <Toggle
              label="Pixel mode (low-res with outlines)"
              checked={pixelMode}
              onChange={(checked) => onVisualOptions({ ...visual, pixelMode: checked })}
            />
            <Toggle
              label="Film grain"
              checked={grain}
              onChange={(checked) => onVisualOptions({ ...visual, grain: checked })}
            />
            <Toggle
              label="Chromatic aberration"
              checked={aberration}
              onChange={(checked) => onVisualOptions({ ...visual, aberration: checked })}
            />
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm tracking-wide text-slate uppercase">
              Third-person camera
            </legend>
            <Toggle
              label="Invert vertical look"
              checked={camera.invertY}
              onChange={(checked) => onCameraOptions({ ...camera, invertY: checked })}
            />
            <Toggle
              label="Swing back behind me while walking"
              checked={camera.autoRecenter}
              onChange={(checked) => onCameraOptions({ ...camera, autoRecenter: checked })}
            />
            <Toggle
              label="Mouse look (click to capture, Esc releases)"
              checked={camera.pointerLock}
              onChange={(checked) => onCameraOptions({ ...camera, pointerLock: checked })}
            />
            <Toggle
              label="Space to jump"
              checked={camera.jump}
              onChange={(checked) => onCameraOptions({ ...camera, jump: checked })}
            />
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}
