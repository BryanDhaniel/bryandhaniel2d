import { portfolio } from "@/content/portfolio";

/**
 * Resolves the public URL used for canonical links, Open Graph and the sitemap.
 * Order: profile.siteUrl in portfolio.ts, NEXT_PUBLIC_SITE_URL, the Vercel production URL,
 * the Vercel deployment URL, then localhost for development.
 */
export function getSiteUrl(): URL {
  const explicit = portfolio.profile.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) {
    return new URL(explicit);
  }
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercelHost) {
    return new URL(`https://${vercelHost}`);
  }
  return new URL(`http://localhost:${process.env.PORT ?? "3000"}`);
}

export const siteTitle = `${portfolio.profile.name} (${portfolio.profile.alias})`;

export const siteDescription = `${portfolio.profile.tagline} Explore a pixel-art village portfolio or read the plain version.`;

interface PersonJsonLd {
  "@context": "https://schema.org";
  "@type": "Person";
  name: string;
  alternateName: string;
  jobTitle: string[];
  description: string;
  url: string;
  address: {
    "@type": "PostalAddress";
    addressLocality: string;
    addressCountry: string;
  };
  alumniOf: { "@type": "CollegeOrUniversity"; name: string }[];
  knowsAbout: string[];
  email?: string;
  sameAs?: string[];
}

export function personJsonLd(): PersonJsonLd {
  const { profile, contact, skills, timeline } = portfolio;
  const [locality = profile.location, country = ""] = profile.location
    .split(",")
    .map((part) => part.trim());
  const sameAs = [contact.github, contact.linkedin].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const universities = Array.from(
    new Set(
      timeline.filter((entry) => entry.kind === "education").map((entry) => entry.organization),
    ),
  );

  const data: PersonJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.name,
    alternateName: profile.alias,
    jobTitle: profile.roles,
    description: profile.tagline,
    url: getSiteUrl().toString(),
    address: {
      "@type": "PostalAddress",
      addressLocality: locality,
      addressCountry: country,
    },
    alumniOf: universities.map((name) => ({ "@type": "CollegeOrUniversity", name })),
    knowsAbout: skills.flatMap((group) => group.skills),
  };
  if (contact.email) {
    data.email = `mailto:${contact.email}`;
  }
  if (sameAs.length > 0) {
    data.sameAs = sameAs;
  }
  return data;
}

/** Serialises JSON-LD for a <script> tag, escaping `<` so content can't close the tag. */
export function serializeJsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
