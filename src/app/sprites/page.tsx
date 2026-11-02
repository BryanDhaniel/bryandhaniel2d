import type { Metadata } from "next";
import Link from "next/link";
import { ContactSheet } from "@/components/sprites/ContactSheet";

export const metadata: Metadata = {
  title: "Sprite contact sheet",
  description: "Every frame of the player sprite, for reviewing the pixel art.",
  robots: { index: false, follow: false },
};

/**
 * Debug route for reviewing the player's pixel art: all 40 frames at 4x and 8x, the
 * animations playing, contrast against the ground and water, and the portrait.
 */
export default function SpritesPage() {
  return (
    <main className="min-h-dvh bg-night px-4 py-8 text-cloud sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold sm:text-4xl">Player sprite contact sheet</h1>
            <p className="mt-2 max-w-2xl text-mist">
              Drawn from the pixel data in <code>src/game3d/entities/Player/art.ts</code>. Run{" "}
              <code>npm run sprites</code> to re-export <code>public/assets/sprites/player</code>.
            </p>
          </div>
          <Link href="/" className="pixel-button bg-gold px-3 py-2 text-ink">
            Back to the village
          </Link>
        </header>
        <ContactSheet />
      </div>
    </main>
  );
}
