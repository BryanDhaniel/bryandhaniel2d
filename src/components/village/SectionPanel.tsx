"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";
import { getSection, type SectionId } from "@/content/portfolio";
import { PixelIcon } from "@/components/PixelIcon";
import { SECTION_ICONS, SectionContent } from "@/components/sections";
import { useFocusTrap } from "@/lib/useFocusTrap";

/** Chunky, frame-stepped easing so panels pop like a retro dialogue box. */
const stepped =
  (steps: number) =>
  (t: number): number =>
    Math.round(t * steps) / steps;

function Typewriter({ text, instant }: { text: string; instant: boolean }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (instant) {
      return;
    }
    const timer = window.setInterval(() => {
      setCount((current) => {
        if (current >= text.length) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, 18);
    return () => window.clearInterval(timer);
  }, [text, instant]);
  const shown = instant ? text.length : count;
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, shown)}
        <span className="invisible">{text.slice(shown)}</span>
      </span>
    </>
  );
}

interface SectionPanelProps {
  sectionId: SectionId;
  onClose: () => void;
}

export function SectionPanel({ sectionId, onClose }: SectionPanelProps) {
  const section = getSection(sectionId);
  const reduceMotion = useReducedMotion() ?? false;
  const titleId = useId();
  const summaryId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(dialogRef, onClose, closeRef);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center p-2 sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.15, ease: stepped(3) }}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-ink/70" onClick={onClose} />
      <motion.section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={summaryId}
        tabIndex={-1}
        className="relative flex max-h-[min(90dvh,820px)] w-full max-w-3xl flex-col pixel-panel outline-none"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
        transition={{ duration: reduceMotion ? 0 : 0.24, ease: stepped(6) }}
      >
        {/* Name plate, like the speaker tag on an RPG dialogue box. */}
        <div className="surface-dark absolute -top-4 left-4 flex items-center gap-2 border-4 border-ink bg-night px-3 py-1 text-sm text-gold shadow-pixel-sm">
          <PixelIcon name={SECTION_ICONS[sectionId]} size={20} />
          <span>{section.building}</span>
        </div>
        <header className="flex items-start gap-4 border-b-4 border-ink px-5 pt-7 pb-4 sm:px-7">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-3xl leading-tight font-bold sm:text-4xl">
              {section.title}
            </h2>
            <p id={summaryId} className="mt-1 text-lg text-slate">
              <Typewriter key={sectionId} text={section.summary} instant={reduceMotion} />
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="pixel-button shrink-0 bg-cloud p-2 text-ink hover:bg-wheat"
            aria-label={`Close ${section.title}`}
          >
            <PixelIcon name="close" size={20} />
          </button>
        </header>
        <div className="overflow-y-auto overscroll-contain px-5 py-6 sm:px-7">
          <SectionContent id={sectionId} />
        </div>
        <footer className="flex items-center justify-between gap-3 border-t-4 border-ink bg-wheat px-5 py-2 text-sm text-slate sm:px-7">
          <span>
            <kbd className="border-2 border-ink bg-cloud px-1.5 text-ink">Esc</kbd> to close
          </span>
          <PixelIcon name="arrow" size={10} className="rotate-180 animate-pulse" />
        </footer>
      </motion.section>
    </motion.div>
  );
}
