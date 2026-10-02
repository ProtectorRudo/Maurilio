import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Maurilio — Tipsters verificables",
    short_name: "Maurilio",
    description:
      "Marketplace de tipsters con historial verificable, cuotas Bet365 registradas y suscripciones.",
    start_url: "/maurilio",
    display: "standalone",
    background_color: "#050807",
    theme_color: "#07130e",
    icons: [
      {
        src: "/maurilio/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
