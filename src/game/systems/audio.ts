import { STORAGE_KEYS, readFlag, writeFlag } from "@/lib/storage";

/**
 * Chiptune sound effects. Nothing is created until the first user gesture calls `unlock()`:
 * then an AudioContext is opened and each effect is synthesised into a buffer (square,
 * triangle and noise voices). If a file URL is configured for an effect it is fetched lazily
 * and replaces the synthesised version once decoded; failures keep the synth.
 *
 * Plain TypeScript with no Phaser dependency, so the React HUD and the game share one instance.
 */

export type SfxName = "step" | "open" | "close" | "blip";

type Wave = "square" | "triangle" | "noise";

interface Voice {
  wave: Wave;
  /** Start frequency in Hz (ignored for noise). */
  freq: number;
  /** Optional end frequency for a pitch slide. */
  slideTo?: number;
  start: number;
  duration: number;
  volume: number;
  /** Square-wave duty cycle, 0-1. */
  duty?: number;
}

const NOTE = {
  C5: 523.25,
  E5: 659.25,
  G5: 783.99,
  C6: 1046.5,
  E6: 1318.5,
} as const;

const RECIPES: Record<SfxName, Voice[]> = {
  step: [
    { wave: "noise", freq: 0, start: 0, duration: 0.03, volume: 0.18 },
    { wave: "triangle", freq: 140, slideTo: 80, start: 0, duration: 0.05, volume: 0.22 },
  ],
  open: [
    { wave: "square", freq: NOTE.C5, start: 0, duration: 0.07, volume: 0.12, duty: 0.25 },
    { wave: "square", freq: NOTE.E5, start: 0.06, duration: 0.07, volume: 0.12, duty: 0.25 },
    { wave: "square", freq: NOTE.G5, start: 0.12, duration: 0.07, volume: 0.12, duty: 0.25 },
    { wave: "square", freq: NOTE.C6, start: 0.18, duration: 0.14, volume: 0.12, duty: 0.25 },
    { wave: "triangle", freq: NOTE.C5 / 2, start: 0, duration: 0.3, volume: 0.1 },
  ],
  close: [
    { wave: "square", freq: NOTE.G5, start: 0, duration: 0.07, volume: 0.11, duty: 0.25 },
    { wave: "square", freq: NOTE.E5, start: 0.06, duration: 0.07, volume: 0.11, duty: 0.25 },
    {
      wave: "square",
      freq: NOTE.C5,
      slideTo: NOTE.C5 * 0.9,
      start: 0.12,
      duration: 0.12,
      volume: 0.11,
      duty: 0.25,
    },
  ],
  blip: [
    {
      wave: "square",
      freq: NOTE.E6,
      slideTo: NOTE.C6,
      start: 0,
      duration: 0.05,
      volume: 0.08,
      duty: 0.5,
    },
  ],
};

export type SfxSources = Partial<Record<SfxName, string>>;

type AudioContextConstructor = typeof AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }
  const legacy = (window as Window & { webkitAudioContext?: AudioContextConstructor })
    .webkitAudioContext;
  return window.AudioContext ?? legacy ?? null;
}

function renderVoices(ctx: BaseAudioContext, voices: readonly Voice[]): AudioBuffer {
  const rate = ctx.sampleRate;
  const end = voices.reduce((max, voice) => Math.max(max, voice.start + voice.duration), 0);
  const length = Math.ceil((end + 0.02) * rate);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let noiseState = 0x2545f491;

  for (const voice of voices) {
    const startSample = Math.floor(voice.start * rate);
    const samples = Math.floor(voice.duration * rate);
    const attack = Math.max(1, Math.floor(0.004 * rate));
    let phase = 0;
    let held = 0;
    for (let i = 0; i < samples; i += 1) {
      const t = i / samples;
      const envelope = (i < attack ? i / attack : 1) * (1 - t) * (1 - t);
      let sample: number;
      if (voice.wave === "noise") {
        // Low-rate sample-and-hold noise sounds like a soft NES "crunch".
        if (i % 4 === 0) {
          noiseState ^= noiseState << 13;
          noiseState ^= noiseState >>> 17;
          noiseState ^= noiseState << 5;
          held = ((noiseState >>> 0) / 4294967295) * 2 - 1;
        }
        sample = held;
      } else {
        const freq = voice.slideTo ? voice.freq + (voice.slideTo - voice.freq) * t : voice.freq;
        phase = (phase + freq / rate) % 1;
        sample =
          voice.wave === "square"
            ? phase < (voice.duty ?? 0.5)
              ? 1
              : -1
            : 1 - 4 * Math.abs(phase - 0.5);
      }
      const index = startSample + i;
      if (index < length) {
        data[index] = (data[index] ?? 0) + sample * envelope * voice.volume;
      }
    }
  }
  return buffer;
}

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<SfxName, AudioBuffer>();
  private muted: boolean;
  private lastStepAt = 0;

  constructor(private readonly sources: SfxSources = {}) {
    // "Mute" is off by default; the visitor's choice is remembered.
    this.muted = readFlag("local", STORAGE_KEYS.muted, false);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    writeFlag("local", STORAGE_KEYS.muted, muted);
    if (!muted) {
      this.unlock();
    }
  }

  /** Call from a user gesture. Creates the AudioContext and buffers on first use. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        void this.ctx.resume().catch(() => undefined);
      }
      return;
    }
    const Ctor = audioContextConstructor();
    if (!Ctor) {
      return;
    }
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      for (const name of Object.keys(RECIPES) as SfxName[]) {
        this.buffers.set(name, renderVoices(ctx, RECIPES[name]));
      }
      void this.loadSources(ctx);
    } catch (error) {
      console.warn("Audio is unavailable:", error);
      this.ctx = null;
      this.master = null;
    }
  }

  play(name: SfxName, playbackRate = 1): void {
    if (this.muted || !this.ctx || !this.master || this.ctx.state !== "running") {
      return;
    }
    if (name === "step") {
      // Footsteps from two feet can land on the same frame; keep them from stacking.
      const now = this.ctx.currentTime;
      if (now - this.lastStepAt < 0.12) {
        return;
      }
      this.lastStepAt = now;
    }
    const buffer = this.buffers.get(name);
    if (!buffer) {
      return;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    source.connect(this.master);
    source.start();
  }

  dispose(): void {
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.buffers.clear();
    if (ctx) {
      void ctx.close().catch(() => undefined);
    }
  }

  private async loadSources(ctx: AudioContext): Promise<void> {
    const entries = Object.entries(this.sources) as [SfxName, string | undefined][];
    await Promise.all(
      entries.map(async ([name, url]) => {
        if (!url) {
          return;
        }
        try {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const decoded = await ctx.decodeAudioData(await response.arrayBuffer());
          if (this.ctx === ctx) {
            this.buffers.set(name, decoded);
          }
        } catch (error) {
          console.warn(`Could not load sound "${name}" from ${url}; using the synth.`, error);
        }
      }),
    );
  }
}
