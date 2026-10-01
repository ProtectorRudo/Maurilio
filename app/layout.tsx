import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://viralio.net/maurilio";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Maurilio Bet — Quant Football",
    template: "%s · Maurilio",
  },
  description:
    "Auditoría cuantitativa de mercados deportivos. Compramos probabilidades, no certezas.",
  applicationName: "Maurilio",
  alternates: { canonical: siteUrl },
  openGraph: {
    title: "Maurilio Bet — Quant Football",
    description: "El mercado pone el precio. Nosotros auditamos la probabilidad.",
    type: "website",
    locale: "es_AR",
    siteName: "Maurilio",
  },
  twitter: {
    card: "summary_large_image",
    title: "Maurilio Bet — Quant Football",
    description: "El mercado pone el precio. Nosotros auditamos la probabilidad.",
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
      <body>{children}</body>
    </html>
  );
}
