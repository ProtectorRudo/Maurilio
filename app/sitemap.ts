import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://viralio.net/maurilio";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/como-funciona`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/para-tipsters`, changeFrequency: "weekly", priority: 0.8 },
  ];
}
