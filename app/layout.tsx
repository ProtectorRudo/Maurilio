import type { Metadata, Viewport } from "next";
import "./globals.css";
import MarketplaceFooter from "@/components/MarketplaceFooter";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://viralio.net/maurilio";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Maurilio — Tipsters verificables",
    template: "%s · Maurilio",
  },
  description:
    "Marketplace de tipsters con historial verificable, cuotas Bet365 registradas y suscripciones.",
  applicationName: "Maurilio",
  alternates: { canonical: siteUrl },
  openGraph: {
    title: "Maurilio — Tipsters verificables",
    description:
      "Seguí tipsters por historial registrado. El pasado es público; los tips futuros son para suscriptores.",
    type: "website",
    locale: "es_AR",
    siteName: "Maurilio",
  },
  twitter: {
    card: "summary_large_image",
    title: "Maurilio — Tipsters verificables",
    description: "Historial real, cuotas Bet365 registradas y suscripciones.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#07130e",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}<MarketplaceFooter /></body>
    </html>
  );
}
