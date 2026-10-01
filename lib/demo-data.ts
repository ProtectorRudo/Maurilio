import type { ArchiveEntry, Matchday } from "./types";

export const currentMatchday: Matchday = {
  label: "01 OCT · MATCHDAY 001",
  slug: "2026-10-01",
  date: "2026-10-01",
  picks: [
    {
      id: "M001",
      tier: "free",
      competition: "MAURILIO LAB · DEMO",
      event: "Atlético Norte vs Unión Central",
      market: "Más de 4.5 tarjetas",
      price: "1.83",
      minimum: "1.72",
      implied: 54.6,
      model: 63,
      range: "58–67%",
      edge: 8.4,
      ev: 15.3,
      stake: "0.75%",
      thesis: "El precio de mercado infravalora una combinación de ritmo, disciplina y contexto competitivo.",
      risk: "La señal depende de que el partido conserve intensidad competitiva; un guion muy tempranamente resuelto reduce faltas y tarjetas.",
      bookmaker: "Bet365",
      capturedAt: "19:00 ART",
    },
  ],
  archivePreview: [
    { id: "#M001", edge: "+8.4%", clv: "—", status: "DEMO" },
    { id: "#M002", edge: "—", clv: "—", status: "LOCKED" },
    { id: "#M003", edge: "—", clv: "—", status: "LOCKED" },
  ],
};

export const archiveEntries: ArchiveEntry[] = [
  { id: "M001", date: "01 OCT", event: "Atlético Norte vs Unión Central", market: "Más de 4.5 tarjetas", price: "1.83", edge: "+8.4%", clv: "—", result: "DEMO", pnl: "—" },
  { id: "M000", date: "PRE-LAUNCH", event: "Registro reservado", market: "—", price: "—", edge: "—", clv: "—", result: "DEMO", pnl: "—" },
];
