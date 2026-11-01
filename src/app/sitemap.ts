import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  return [
    { url: new URL("/", base).toString(), changeFrequency: "monthly", priority: 1 },
    { url: new URL("/plain", base).toString(), changeFrequency: "monthly", priority: 0.9 },
  ];
}
