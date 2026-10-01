import { ImageResponse } from "next/og";

export const alt = "Maurilio — Quant Football";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(circle at 78% 20%, rgba(105,243,154,.18), transparent 24%), #050807",
          color: "#f2f6f3",
          padding: "64px 72px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 62,
              height: 62,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #69f39a",
              color: "#69f39a",
              fontSize: 28,
              fontWeight: 900,
            }}
          >
            M
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: 5 }}>MAURILIO</span>
            <span style={{ fontSize: 12, color: "#748077", letterSpacing: 4 }}>QUANT FOOTBALL</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 950 }}>
          <span style={{ color: "#69f39a", fontSize: 18, letterSpacing: 4, marginBottom: 22 }}>
            VALUE OVER NOISE
          </span>
          <div style={{ fontSize: 68, lineHeight: 1.02, fontWeight: 800, letterSpacing: -4 }}>
            El mercado pone el precio.
            <br />
            <span style={{ color: "#7f8e85" }}>Nosotros auditamos la probabilidad.</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 34, color: "#7d8982", fontSize: 16, letterSpacing: 2 }}>
          <span>EDGE</span>
          <span>EV</span>
          <span>CUOTA MÍNIMA</span>
          <span>CLV</span>
        </div>
      </div>
    ),
    size,
  );
}
