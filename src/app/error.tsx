"use client";

import Link from "next/link";
import { useEffect } from "react";
import { rememberFallbackReason } from "@/lib/fallback";

export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-night p-4">
      <div role="alert" className="max-w-md space-y-4 p-6 pixel-panel">
        <h1 className="text-3xl font-bold">Something broke</h1>
        <p className="text-slate">
          The page hit an unexpected error. The normal view has all the same content.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/plain"
            onClick={() => rememberFallbackReason("error")}
            className="pixel-button bg-gold px-4 py-3 text-ink"
          >
            Open the normal view
          </Link>
          <button
            type="button"
            onClick={() => retry()}
            className="pixel-button bg-cloud px-4 py-3 text-ink hover:bg-wheat"
          >
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}
