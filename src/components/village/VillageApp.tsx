"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { getSection, portfolio, type SectionId } from "@/content/portfolio";
import { ASSET_SOURCES } from "@/game/assets/manifest";
import { GameBridge, type GameToUiEvents, type MapInfo } from "@/game/bridge";
import type {
  DayPhase,
  QualityLevel,
  QualitySetting,
  TimeMode,
  WeatherKind,
} from "@/game/settings/types";
import { AudioSystem } from "@/game/systems/audio";
import { useCapabilities } from "@/lib/capabilities";
import { useMediaQuery, useStoredValue } from "@/lib/hooks";
import { defaultQualityFor, storedQuality, storedTimeMode, storedWeather } from "@/lib/settings";
import { STORAGE_KEYS, writeFlag, writeStorage } from "@/lib/storage";
import { ControlsHint } from "./ControlsHint";
import { DPad } from "./DPad";
import { GameErrorBoundary } from "./GameErrorBoundary";
import { Hud } from "./Hud";
import { InteractionPrompt } from "./InteractionPrompt";
import { LoadingScreen } from "./LoadingScreen";
import { GameErrorNotice, LowFpsToast, PlainViewOffer, WebGLFallback } from "./Notices";
import { SectionPanel } from "./SectionPanel";

// Phaser is only ever downloaded and run in the browser, and only on this route.
const GameCanvas = dynamic(() => import("./GameCanvas"), { ssr: false });

const INITIAL_PROGRESS = { value: 0.08, label: "Packing the engine" };
const DEFAULT_LOCATION = "Kiznaiver's Village";

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
  const retro = useStoredValue("local", STORAGE_KEYS.retro) === "1";

  const [bridge] = useState(() => new GameBridge());
  const [audio] = useState(() => new AudioSystem(ASSET_SOURCES.audio));
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
      bridge.on("fatal", (next) => setFatal(next)),
    ];
    return () => subscriptions.forEach((off) => off());
  }, [bridge, audio, focusGame]);

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

  const changeRetro = (enabled: boolean) => {
    writeFlag("local", STORAGE_KEYS.retro, enabled);
    bridge.emit("setRetro", { enabled });
    audio.play("blip");
  };

  const travel = (sectionId: SectionId) => {
    bridge.emit("travel", { sectionId });
    focusGame();
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
            retro,
            onTimeMode: changeTimeMode,
            onWeather: changeWeather,
            onQuality: changeQuality,
            onRetro: changeRetro,
          }}
          onToggleMute={toggleMute}
          onTravel={travel}
        />

        <InteractionPrompt
          bridge={bridge}
          touch={touch}
          hidden={panelOpen || !ready}
          onActivate={() => {
            bridge.emit("interact", null);
            focusGame();
          }}
        />

        <ControlsHint id={hintId} visible={ready && !moved && !panelOpen} touch={touch} />
        {touch && ready ? <DPad bridge={bridge} canInteract={near !== null && !panelOpen} /> : null}

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
