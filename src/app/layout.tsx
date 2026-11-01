import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Pixelify_Sans } from "next/font/google";
import { portfolio } from "@/content/portfolio";
import { PALETTE, paletteCssVariables } from "@/game/palette";
import { getSiteUrl, siteDescription, siteTitle } from "@/lib/site";
import "./globals.css";

const pixelify = Pixelify_Sans({
  variable: "--font-pixelify",
  subsets: ["latin"],
  display: "swap",
});

const [firstName = portfolio.profile.name, ...lastNames] = portfolio.profile.name.split(" ");

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: `${siteTitle} · ${portfolio.profile.roles.join(" & ")}`,
    template: `%s · ${portfolio.profile.name}`,
  },
  description: siteDescription,
  applicationName: `${portfolio.profile.alias}'s Village`,
  authors: [{ name: portfolio.profile.name }],
  creator: portfolio.profile.name,
  keywords: [
    portfolio.profile.name,
    portfolio.profile.alias,
    ...portfolio.profile.roles,
    portfolio.profile.location,
    "portfolio",
    "pixel art",
  ],
  openGraph: {
    type: "profile",
    siteName: `${portfolio.profile.alias}'s Village`,
    title: siteTitle,
    description: siteDescription,
    locale: "en_US",
    firstName,
    lastName: lastNames.join(" "),
    username: portfolio.profile.alias,
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: PALETTE.night,
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={pixelify.variable}>
      <head>
        <style id="palette">{paletteCssVariables()}</style>
      </head>
      <body className="font-pixel antialiased">{children}</body>
    </html>
  );
}
