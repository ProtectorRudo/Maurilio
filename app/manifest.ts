import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Maurilio — Quant Football",
    short_name: "Maurilio",
    description: "Auditoría cuantitativa de mercados deportivos.",
    start_url: "/",
    display: "standalone",
    background_color: "#050807",
    theme_color: "#07130e",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
