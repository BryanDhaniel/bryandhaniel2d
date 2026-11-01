import type { ReactNode } from "react";
import type { SectionId } from "@/content/portfolio";
import type { IconName } from "@/game/art/icons";
import { PixelIcon } from "@/components/PixelIcon";

export const SECTION_ICONS: Record<SectionId, IconName> = {
  about: "house",
  projects: "gear",
  education: "book",
  skills: "chip",
  contact: "envelope",
};

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block border-2 border-ink bg-wheat px-2 py-0.5 text-sm leading-tight text-ink">
      {children}
    </span>
  );
}

function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href);
}

interface PixelLinkProps {
  href: string;
  icon: IconName;
  children: ReactNode;
  /** Adds the `download` attribute (for the CV). */
  download?: boolean;
  variant?: "primary" | "secondary";
  "aria-label"?: string;
}

/** A link styled as a chunky pixel button. External links open in a new tab. */
export function PixelLink({
  href,
  icon,
  children,
  download,
  variant = "secondary",
  "aria-label": ariaLabel,
}: PixelLinkProps) {
  const external = isExternal(href) && !download;
  const colors = variant === "primary" ? "bg-gold text-ink" : "bg-cloud text-ink hover:bg-wheat";
  return (
    <a
      href={href}
      className={`pixel-button px-3 py-2 text-base ${colors}`}
      aria-label={ariaLabel}
      download={download ? "" : undefined}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
    >
      <PixelIcon name={icon} size={20} />
      <span>{children}</span>
      {external ? <span className="sr-only"> (opens in a new tab)</span> : null}
    </a>
  );
}
