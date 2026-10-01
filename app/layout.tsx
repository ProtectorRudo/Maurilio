import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maurilio Bet — Quant Football",
  description:
    "Auditoría cuantitativa de mercados deportivos. Compramos probabilidades, no certezas.",
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
