import type { NextConfig } from "next";

const development = process.env.NODE_ENV === "development";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${development ? " ws: wss:" : ""}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
].join("; ");

const privateHeaders = [
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Referrer-Policy", value: "no-referrer" },
];

const nextConfig: NextConfig = {
  basePath: "/maurilio",
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      { source: "/api/:path*", headers: privateHeaders },
      { source: "/ingresar", headers: privateHeaders },
      { source: "/onboarding", headers: privateHeaders },
      { source: "/recuperar", headers: privateHeaders },
      { source: "/actualizar-clave", headers: privateHeaders },
      { source: "/mis-tips/:path*", headers: privateHeaders },
      { source: "/suscripciones/:path*", headers: privateHeaders },
      { source: "/estudio/:path*", headers: privateHeaders },
      { source: "/cuenta/:path*", headers: privateHeaders },
      { source: "/panel-tipster/:path*", headers: privateHeaders },
      { source: "/admin/:path*", headers: privateHeaders },
    ];
  },
};

export default nextConfig;
