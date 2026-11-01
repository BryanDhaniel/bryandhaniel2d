import type { Metadata } from "next";
import { portfolio } from "@/content/portfolio";
import { VillageApp } from "@/components/village/VillageApp";
import { personJsonLd, serializeJsonLd } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(personJsonLd()) }}
      />
      <VillageApp />
      <noscript>
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-night p-4">
          <div className="max-w-lg space-y-3 p-6 pixel-panel">
            <p className="text-2xl font-bold">{portfolio.profile.name}</p>
            <p>{portfolio.profile.tagline}</p>
            <p>
              The pixel village needs JavaScript.{" "}
              <a href="/plain" className="font-bold underline decoration-2 underline-offset-4">
                Read the normal portfolio instead
              </a>
              .
            </p>
          </div>
        </div>
      </noscript>
    </>
  );
}
