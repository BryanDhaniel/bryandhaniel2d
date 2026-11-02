import { portfolio } from "@/content/portfolio";
import { PixelGrid } from "@/components/PixelGrid";
import { playerFrame } from "@/game3d/entities/Player/art";
import { SkipLink } from "./SkipLink";

const SEGMENTS = 20;
const PLAYER_ART = playerFrame("down", "idle", 0);

interface LoadingScreenProps {
  value: number;
  label: string;
}

/** Full-screen loader with a segmented pixel progress bar. Server-renderable. */
export function LoadingScreen({ value, label }: LoadingScreenProps) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const filled = Math.round((percent / 100) * SEGMENTS);
  return (
    <div className="surface-dark absolute inset-0 z-40 flex flex-col items-center justify-center gap-8 bg-night px-4 text-cloud">
      <div className="absolute top-3 right-3">
        <SkipLink />
      </div>
      <div className="bg-mist/90 p-2 pixel-panel">
        <PixelGrid rows={PLAYER_ART} scale={6} />
      </div>
      <div className="text-center">
        <p className="text-sm tracking-[0.3em] text-gold uppercase">{portfolio.profile.name}</p>
        <p className="mt-2 text-3xl leading-tight font-bold sm:text-5xl">
          {portfolio.profile.alias}&apos;s Village
        </p>
        <p className="mt-2 text-mist">{portfolio.profile.roles.join(" · ")}</p>
      </div>
      <div className="w-full max-w-sm">
        <div
          role="progressbar"
          aria-label="Loading the village"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent}% · ${label}`}
          className="flex gap-1 border-4 border-ink bg-ink p-1 shadow-pixel"
        >
          {Array.from({ length: SEGMENTS }, (_, index) => (
            <span
              key={index}
              className={`h-5 flex-1 ${index < filled ? (index % 2 ? "bg-gold" : "bg-sun") : "bg-slate"}`}
            />
          ))}
        </div>
        <p className="mt-3 flex justify-between gap-4 text-sm text-mist" aria-hidden="true">
          <span>{label}…</span>
          <span>{percent}%</span>
        </p>
      </div>
    </div>
  );
}
