"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { PixelIcon } from "@/components/PixelIcon";
import { FALLBACK_MESSAGES, rememberFallbackReason, type FallbackReason } from "@/lib/fallback";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-night/95 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="notice-title"
        className="w-full max-w-lg space-y-4 p-6 pixel-panel"
      >
        <h2 id="notice-title" className="flex items-center gap-3 text-2xl font-bold">
          <PixelIcon name="pin" size={30} />
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

/** Asks visitors who prefer reduced motion or are on a low-power device which view they want. */
export function PlainViewOffer({
  reason,
  onPlay,
}: {
  reason: Extract<FallbackReason, "reduced-motion" | "low-power">;
  onPlay: () => void;
}) {
  const copy =
    reason === "reduced-motion"
      ? "Your system asks for reduced motion. The normal view has all the same content with no animation."
      : "This device looks like it's saving power. The normal view is lighter and has all the same content.";
  return (
    <Card title="Prefer the normal view?">
      <p className="text-lg leading-relaxed">{copy}</p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/plain"
          onClick={() => rememberFallbackReason(reason)}
          className="pixel-button bg-gold px-4 py-3 text-lg text-ink"
          autoFocus
        >
          <PixelIcon name="book" size={20} />
          Open the normal view
        </Link>
        <button
          type="button"
          onClick={onPlay}
          className="pixel-button bg-cloud px-4 py-3 text-lg text-ink hover:bg-wheat"
        >
          <PixelIcon name="house" size={20} />
          Explore the village anyway
        </button>
      </div>
    </Card>
  );
}

/** No WebGL: explain, then move to /plain automatically. */
export function WebGLFallback() {
  const router = useRouter();
  useEffect(() => {
    rememberFallbackReason("webgl");
    const timer = window.setTimeout(() => router.replace("/plain"), 2500);
    return () => window.clearTimeout(timer);
  }, [router]);
  return (
    <Card title="Opening the normal view">
      <p className="text-lg leading-relaxed" role="status">
        {FALLBACK_MESSAGES.webgl} Taking you there now…
      </p>
      <Link href="/plain" replace className="pixel-button bg-gold px-4 py-3 text-lg text-ink">
        <PixelIcon name="book" size={20} />
        Go now
      </Link>
    </Card>
  );
}

/** Any other startup failure: offer the plain view or a retry. */
export function GameErrorNotice({ message }: { message: string }) {
  return (
    <Card title="The village didn't load">
      <p className="text-lg leading-relaxed">{FALLBACK_MESSAGES.error}</p>
      <p className="border-2 border-ink bg-wheat p-2 text-sm text-slate">{message}</p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/plain"
          onClick={() => rememberFallbackReason("error")}
          className="pixel-button bg-gold px-4 py-3 text-lg text-ink"
        >
          <PixelIcon name="book" size={20} />
          Open the normal view
        </Link>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="pixel-button bg-cloud px-4 py-3 text-lg text-ink hover:bg-wheat"
        >
          Try again
        </button>
      </div>
    </Card>
  );
}

/** Shown once if the frame rate stays low after loading. */
export function LowFpsToast({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="status"
      className="pointer-events-auto absolute inset-x-0 bottom-4 z-40 flex justify-center px-4"
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 pixel-panel">
        <p>The village seems slow on this device.</p>
        <Link
          href="/plain"
          onClick={() => rememberFallbackReason("low-fps")}
          className="pixel-button bg-gold px-3 py-2 text-ink"
        >
          Normal view
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          className="pixel-button bg-cloud px-3 py-2 text-ink hover:bg-wheat"
        >
          Keep playing
        </button>
      </div>
    </div>
  );
}
