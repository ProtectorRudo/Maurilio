import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/maurilio/control-room"],
      },
    ],
    sitemap: "https://viralio.net/maurilio/sitemap.xml",
  };
}
