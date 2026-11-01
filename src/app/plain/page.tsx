import type { Metadata } from "next";
import Link from "next/link";
import { portfolio } from "@/content/portfolio";
import { PixelIcon } from "@/components/PixelIcon";
import { FallbackNotice } from "@/components/FallbackNotice";
import { SECTION_ICONS, SectionContent } from "@/components/sections";
import { PixelLink } from "@/components/sections/shared";
import { personJsonLd, serializeJsonLd, siteDescription } from "@/lib/site";

export const metadata: Metadata = {
  title: "Portfolio",
  description: siteDescription,
  alternates: { canonical: "/plain" },
};

export default function PlainPage() {
  const { profile, sections, contact } = portfolio;
  return (
    <div className="min-h-dvh bg-night text-ink">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(personJsonLd()) }}
      />
      <a
        href="#main"
        className="sr-only-focusable fixed top-3 left-3 z-50 pixel-button bg-gold px-3 py-2 text-ink"
      >
        Skip to content
      </a>

      <header className="surface-dark border-b-4 border-ink bg-deep text-cloud">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
          <p className="text-lg tracking-widest text-gold uppercase">{profile.alias}</p>
          <h1 className="text-4xl leading-tight font-bold sm:text-6xl">{profile.name}</h1>
          <p className="text-xl text-foam sm:text-2xl">{profile.roles.join(" · ")}</p>
          <p className="flex items-center gap-2 text-lg text-mist">
            <PixelIcon name="pin" size={20} />
            {profile.location}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/" className="pixel-button bg-gold px-4 py-3 text-lg text-ink">
              <PixelIcon name="house" size={20} />
              Visit the pixel village
            </Link>
            {contact.cvUrl ? (
              <PixelLink href={contact.cvUrl} icon="download" download>
                Download CV
              </PixelLink>
            ) : null}
          </div>
        </div>
      </header>

      <nav
        aria-label="Sections"
        className="surface-dark sticky top-0 z-40 border-b-4 border-ink bg-night/95 text-cloud backdrop-blur-sm"
      >
        <ul className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 py-2 sm:px-6">
          {sections.map((section) => (
            <li key={section.id} className="shrink-0">
              <a
                href={`#${section.id}`}
                className="flex items-center gap-2 px-3 py-2 text-base hover:bg-slate"
              >
                <PixelIcon name={SECTION_ICONS[section.id]} size={20} />
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main id="main" tabIndex={-1} className="mx-auto max-w-4xl space-y-10 px-4 py-10 sm:px-6">
        <FallbackNotice />
        {sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-heading`}
            className="scroll-mt-20 p-5 pixel-panel sm:p-8"
          >
            <header className="mb-6 flex items-start gap-3 border-b-4 border-ink pb-4">
              <PixelIcon name={SECTION_ICONS[section.id]} size={40} className="shrink-0" />
              <div>
                <h2 id={`${section.id}-heading`} className="text-3xl leading-tight font-bold">
                  {section.title}
                </h2>
                <p className="text-slate">{section.summary}</p>
              </div>
            </header>
            <SectionContent id={section.id} />
          </section>
        ))}
      </main>

      <footer className="surface-dark border-t-4 border-ink bg-ink text-mist">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
          <p>
            © {profile.name} ({profile.alias})
          </p>
          <Link href="/" className="underline decoration-2 underline-offset-4 hover:text-gold">
            Back to the village
          </Link>
        </div>
      </footer>
    </div>
  );
}
