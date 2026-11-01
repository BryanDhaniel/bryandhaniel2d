import Link from "next/link";
import { PixelSprite } from "@/components/PixelSprite";
import { CAT_FRAMES } from "@/game/art/characters";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-night p-4">
      <div className="max-w-md space-y-4 p-6 text-center pixel-panel">
        <PixelSprite art={CAT_FRAMES.sleep} scale={6} className="mx-auto" />
        <h1 className="text-3xl font-bold">You wandered off the map</h1>
        <p className="text-slate">
          There&apos;s nothing at this address. The cat is asleep, so it can&apos;t help.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/" className="pixel-button bg-gold px-4 py-3 text-ink">
            Back to the village
          </Link>
          <Link href="/plain" className="pixel-button bg-cloud px-4 py-3 text-ink hover:bg-wheat">
            Normal view
          </Link>
        </div>
      </div>
    </main>
  );
}
