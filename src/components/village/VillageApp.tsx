"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { getSection, portfolio, type SectionId } from "@/content/portfolio";
import { GameBridge, type GameToUiEvents, type MapInfo } from "@/game/bridge";
import type {
  CameraMode,
  CameraOptions,
  DayPhase,
  QualityLevel,
  QualitySetting,
  TimeMode,
  WeatherKind,
} from "@/game/settings/types";
import { AUDIO_SOURCES } from "@/game3d/config/assets";
import { AudioSystem } from "@/game3d/systems/audio";
import { useCapabilities } from "@/lib/capabilities";
import { useMediaQuery, useStoredValue } from "@/lib/hooks";
import {
  defaultQualityFor,
  storedCameraMode,
  storedQuality,
  storedTimeMode,
  storedWeather,
} from "@/lib/settings";
import { STORAGE_KEYS, writeFlag, writeStorage } from "@/lib/storage";
import { ControlsHint } from "./ControlsHint";
import { DebugPanel } from "./DebugPanel";
import { DPad } from "./DPad";
import { GameErrorBoundary } from "./GameErrorBoundary";
import { Hud } from "./Hud";
import { InteractionPrompt } from "./InteractionPrompt";
import { Joystick } from "./Joystick";
import { LoadingScreen } from "./LoadingScreen";
import { GameErrorNotice, LowFpsToast, PlainViewOffer, WebGLFallback } from "./Notices";
import { SectionPanel } from "./SectionPanel";
import { Waypoints } from "./Waypoints";

// three.js and the 3D world are only ever downloaded and run in the browser, on this route.
const GameCanvas = dynamic(() => import("./GameCanvas"), { ssr: false });

const INITIAL_PROGRESS = { value: 0.08, label: "Packing the engine" };
const DEFAULT_LOCATION = "Kiznaiver's Village";
/** Quick travel: fade to black, jump, fade back (milliseconds). */
const TRAVEL_FADE_MS = 220;

type Fatal = GameToUiEvents["fatal"];
type Near = { sectionId: SectionId; label: string };

export function VillageApp() {
  const capabilities = useCapabilities();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const touch = useMediaQuery("(pointer: coarse)");
  const playAnyway = useStoredValue("session", STORAGE_KEYS.playAnyway) === "1";
  const muted = useStoredValue("local", STORAGE_KEYS.muted) === "1";
  const timeMode = storedTimeMode(useStoredValue("local", STORAGE_KEYS.timeMode));
  const weather = storedWeather(useStoredValue("local", STORAGE_KEYS.weather));
  const quality = storedQuality(
    useStoredValue("local", STORAGE_KEYS.quality),
    defaultQualityFor({ touch, reducedMotion, lowPower: capabilities?.lowPower ?? false }),
  );
  const pixelMode = useStoredValue("local", STORAGE_KEYS.pixelMode) === "1";
  const grain = useStoredValue("local", STORAGE_KEYS.grain) === "1";
  const aberration = useStoredValue("local", STORAGE_KEYS.aberration) === "1";
  const cameraMode = storedCameraMode(useStoredValue("local", STORAGE_KEYS.cameraMode));
  const invertY = useStoredValue("local", STORAGE_KEYS.invertY) === "1";
  const autoRecenter = useStoredValue("local", STORAGE_KEYS.autoRecenter) !== "0";
  const pointerLock = useStoredValue("local", STORAGE_KEYS.pointerLock) === "1";
  const jump = useStoredValue("local", STORAGE_KEYS.jump) === "1";
  const cameraOptions: CameraOptions = { invertY, autoRecenter, pointerLock, jump };

  const [bridge] = useState(() => new GameBridge());
  const [audio] = useState(() => new AudioSystem(AUDIO_SOURCES));
  const [progress, setProgress] = useState(INITIAL_PROGRESS);
  const [mapInfo, setMapInfo] = useState<MapInfo | null>(null);
  const [fatal, setFatal] = useState<Fatal | null>(null);
  const [openSection, setOpenSection] = useState<SectionId | null>(null);
  const [near, setNear] = useState<Near | null>(null);
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [moved, setMoved] = useState(false);
  const [lowFps, setLowFps] = useState(false);
  const [phase, setPhase] = useState<DayPhase | null>(null);
  const [qualityLevel, setQualityLevel] = useState<QualityLevel | null>(null);
  const [fading, setFading] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const gameRef = useRef<HTMLDivElement>(null);
  const hintId = useId();

  const focusGame = useCallback(() => {
    requestAnimationFrame(() => gameRef.current?.focus({ preventScroll: true }));
  }, []);

  // Game → UI events.
  useEffect(() => {
    const subscriptions = [
      bridge.on("progress", (next) =>
        setProgress((current) => (next.value >= current.value ? next : current)),
      ),
      bridge.on("ready", (info) => {
        setMapInfo(info);
        focusGame();
      }),
      bridge.on("near", (next) =>
        setNear(
          next.sectionId && next.label ? { sectionId: next.sectionId, label: next.label } : null,
        ),
      ),
      bridge.on("open", ({ sectionId }) => {
        bridge.emit("pause", { paused: true });
        audio.play("open");
        setOpenSection(sectionId);
      }),
      bridge.on("location", ({ name }) => setLocation(name)),
      bridge.on("moved", () => setMoved(true)),
      bridge.on("lowFps", () => setLowFps(true)),
      bridge.on("clock", (next) => setPhase(next.phase)),
      bridge.on("qualityLevel", (next) => setQualityLevel(next.level)),
      // V or a gamepad switched the view inside the game: remember it.
      bridge.on("cameraMode", ({ mode }) => writeStorage("local", STORAGE_KEYS.cameraMode, mode)),
      bridge.on("fatal", (next) => setFatal(next)),
    ];
    return () => subscriptions.forEach((off) => off());
  }, [bridge, audio, focusGame]);

  // The backquote key toggles the camera debug panel (not while typing in a field).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Backquote" || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      setDebugOpen((open) => !open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Browsers only allow audio after a gesture: open the AudioContext on the first one.
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      audio.dispose();
    };
  }, [audio]);

  // Leaving the route keeps this component alive but hidden (Activity) and destroys the game,
  // so reset transient UI; it starts fresh with a new game when the visitor comes back.
  useLayoutEffect(
    () => () => {
      setProgress(INITIAL_PROGRESS);
      setMapInfo(null);
      setOpenSection(null);
      setNear(null);
      setMoved(false);
      setFatal(null);
      setLowFps(false);
      setLocation(DEFAULT_LOCATION);
      setPhase(null);
      setQualityLevel(null);
    },
    [],
  );

  const closePanel = useCallback(() => {
    setOpenSection(null);
    bridge.emit("pause", { paused: false });
    audio.play("close");
    focusGame();
  }, [bridge, audio, focusGame]);

  const toggleMute = () => {
    audio.setMuted(!muted);
    if (muted) {
      audio.play("blip");
    }
  };

  const changeTimeMode = (mode: TimeMode) => {
    writeStorage("local", STORAGE_KEYS.timeMode, mode);
    bridge.emit("setTimeMode", { mode });
    audio.play("blip");
  };

  const changeWeather = (kind: WeatherKind) => {
    writeStorage("local", STORAGE_KEYS.weather, kind);
    bridge.emit("setWeather", { kind });
    audio.play("blip");
  };

  const changeQuality = (setting: QualitySetting) => {
    writeStorage("local", STORAGE_KEYS.quality, setting);
    bridge.emit("setQuality", { setting });
    audio.play("blip");
  };

  const changeVisualOptions = (next: {
    pixelMode: boolean;
    grain: boolean;
    aberration: boolean;
  }) => {
    writeFlag("local", STORAGE_KEYS.pixelMode, next.pixelMode);
    writeFlag("local", STORAGE_KEYS.grain, next.grain);
    writeFlag("local", STORAGE_KEYS.aberration, next.aberration);
    bridge.emit("setVisualOptions", next);
    audio.play("blip");
  };

  const travel = (sectionId: SectionId) => {
    bridge.emit("travel", { sectionId });
    focusGame();
  };

  const changeCameraMode = (mode: CameraMode) => {
    writeStorage("local", STORAGE_KEYS.cameraMode, mode);
    bridge.emit("setCameraMode", { mode });
    audio.play("blip");
    focusGame();
  };

  const changeCameraOptions = (next: CameraOptions) => {
    writeFlag("local", STORAGE_KEYS.invertY, next.invertY);
    writeFlag("local", STORAGE_KEYS.autoRecenter, next.autoRecenter);
    writeFlag("local", STORAGE_KEYS.pointerLock, next.pointerLock);
    writeFlag("local", STORAGE_KEYS.jump, next.jump);
    bridge.emit("setCameraOptions", next);
    audio.play("blip");
  };

  const resetCamera = () => {
    bridge.emit("resetCamera", null);
    focusGame();
  };

  // Quick travel covers the jump with a short fade (none with reduced motion).
  const quickTravel = (sectionId: SectionId) => {
    focusGame();
    if (reducedMotion) {
      bridge.emit("teleport", { sectionId });
      return;
    }
    setFading(true);
    window.setTimeout(() => {
      bridge.emit("teleport", { sectionId });
      window.setTimeout(() => setFading(false), 80);
    }, TRAVEL_FADE_MS);
  };

  const playVillageAnyway = () => writeFlag("session", STORAGE_KEYS.playAnyway, true);

  const heading = (
    <h1 className="sr-only">
      {portfolio.profile.name} ({portfolio.profile.alias}), {portfolio.profile.roles.join(" and ")}:
      pixel village portfolio
    </h1>
  );

  // Server render and hydration: just the loading shell (identical on both sides).
  if (!capabilities) {
    return (
      <main className="fixed inset-0 overflow-hidden bg-ink">
        {heading}
        <LoadingScreen value={INITIAL_PROGRESS.value} label={INITIAL_PROGRESS.label} />
      </main>
    );
  }

  if (!capabilities.webgl || fatal?.reason === "webgl") {
    return (
      <main className="fixed inset-0 overflow-hidden bg-ink">
        {heading}
        <WebGLFallback />
      </main>
    );
  }

  const offerReason = reducedMotion ? "reduced-motion" : capabilities.lowPower ? "low-power" : null;
  if (offerReason && !playAnyway) {
    return (
      <main className="fixed inset-0 overflow-hidden bg-ink">
        {heading}
        <LoadingScreen value={INITIAL_PROGRESS.value} label="Waiting for you" />
        <PlainViewOffer reason={offerReason} onPlay={playVillageAnyway} />
      </main>
    );
  }

  const panelOpen = openSection !== null;
  const ready = mapInfo !== null;

  return (
    <MotionConfig reducedMotion="user">
      <main className="fixed inset-0 overflow-hidden bg-ink">
        {heading}
        <GameErrorBoundary>
          <GameCanvas
            bridge={bridge}
            audio={audio}
            containerRef={gameRef}
            inert={panelOpen}
            describedBy={hintId}
          />
        </GameErrorBoundary>

        <Hud
          bridge={bridge}
          mapInfo={mapInfo}
          location={location}
          phase={phase}
          near={near}
          nearTitle={near ? getSection(near.sectionId).title : null}
          touch={touch}
          muted={muted}
          inert={panelOpen || !ready}
          settings={{
            timeMode,
            weather,
            quality,
            qualityLevel,
            pixelMode,
            grain,
            aberration,
            onTimeMode: changeTimeMode,
            onWeather: changeWeather,
            onQuality: changeQuality,
            onVisualOptions: changeVisualOptions,
            camera: cameraOptions,
            onCameraOptions: changeCameraOptions,
          }}
          cameraMode={cameraMode}
          onCameraMode={changeCameraMode}
          onResetCamera={resetCamera}
          onQuickTravel={quickTravel}
          onToggleMute={toggleMute}
          onTravel={travel}
        />

        {mapInfo ? (
          <Waypoints
            bridge={bridge}
            markers={mapInfo.markers}
            hidden={panelOpen || cameraMode !== "thirdPerson"}
          />
        ) : null}

        {cameraMode === "thirdPerson" && near && !panelOpen ? (
          // A quiet centre reticle, only while something can be used.
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-1/2 z-20 -mt-1 -ml-1 size-2 border border-ink bg-gold/90"
          />
        ) : null}

        <InteractionPrompt
          bridge={bridge}
          touch={touch}
          hidden={panelOpen || !ready}
          onActivate={() => {
            bridge.emit("interact", null);
            focusGame();
          }}
        />

        <ControlsHint
          id={hintId}
          visible={ready && !moved && !panelOpen}
          touch={touch}
          mode={cameraMode}
        />
        {touch && ready && cameraMode === "thirdPerson" ? (
          <Joystick bridge={bridge} canInteract={near !== null && !panelOpen} />
        ) : null}
        {touch && ready && cameraMode !== "thirdPerson" ? (
          <DPad bridge={bridge} canInteract={near !== null && !panelOpen} />
        ) : null}

        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 z-30 bg-ink transition-opacity duration-200 ${fading ? "opacity-100" : "opacity-0"}`}
        />
        {debugOpen && ready ? (
          <DebugPanel bridge={bridge} onClose={() => setDebugOpen(false)} />
        ) : null}

        <AnimatePresence>
          {openSection ? (
            <SectionPanel key={openSection} sectionId={openSection} onClose={closePanel} />
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {!ready && !fatal ? (
            <motion.div
              key="loading"
              className="absolute inset-0 z-40"
              exit={{
                opacity: 0,
                transition: { duration: 0.35, ease: (t: number) => Math.round(t * 4) / 4 },
              }}
            >
              <LoadingScreen value={progress.value} label={progress.label} />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {fatal ? <GameErrorNotice message={fatal.message} /> : null}
        {lowFps && !panelOpen ? <LowFpsToast onDismiss={() => setLowFps(false)} /> : null}
      </main>
    </MotionConfig>
  );
}
