import Link from "next/link";
import { PixelIcon } from "@/components/PixelIcon";

/** The always-visible way out to the recruiter-friendly page. */
export function SkipLink({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/plain"
      className="pixel-button bg-gold px-3 py-2 text-base text-ink hover:bg-wheat"
      aria-label="Skip to normal view"
    >
      <PixelIcon name="book" size={20} />
      <span className={compact ? "max-sm:hidden" : undefined}>Skip to normal view</span>
      {compact ? <span className="sm:hidden">Normal view</span> : null}
    </Link>
  );
}
