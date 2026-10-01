import type { Metadata } from "next";
import { archiveEntries } from "@/lib/demo-data";
import {
  databaseConfigured,
  getSettledLedger,
  type SettledLedgerRow,
} from "@/lib/server/supabase-rest";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Archivo público — Maurilio",
  description:
    "Ledger auditable de selecciones, precio de entrada, CLV y resultado.",
};

const INITIAL_BANK = 100_000;

function numeric(value: number | string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ars(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
  })
    .format(date)
    .replace(".", "")
    .toUpperCase();
}

function realEntry(row: SettledLedgerRow) {
  const entry = numeric(row.entry_odds);
  const close = numeric(row.closing_odds);
  const own = numeric(row.probability_own);
  const implied = entry ? 1 / entry : null;

  return {
    id: row.public_id,
    date: dateLabel(row.settled_at ?? row.odds_captured_at),
    event: row.event,
    market: row.market,
    price: entry ? entry.toFixed(2) : "—",
    edge:
      own !== null && implied !== null ? pct((own - implied) * 100) : "—",
    clv:
      entry !== null && close !== null && close > 0
        ? pct((entry / close - 1) * 100)
        : "—",
    result: row.result?.toUpperCase() ?? "—",
    pnl:
      numeric(row.pnl_ars) !== null ? ars(numeric(row.pnl_ars) as number) : "—",
  };
}

export default async function ArchivePage() {
  let settled: SettledLedgerRow[] = [];
  if (databaseConfigured()) {
    try {
      settled = await getSettledLedger(250);
    } catch {
      settled = [];
    }
  }

  const hasRealLedger = settled.length > 0;
  const entries = hasRealLedger ? settled.map(realEntry) : archiveEntries;

  const pnl = settled.reduce(
    (sum, row) => sum + (numeric(row.pnl_ars) ?? 0),
    0,
  );
  const totalStake = settled.reduce(
    (sum, row) => sum + (numeric(row.stake_ars) ?? 0),
    0,
  );
  const clvValues = settled.flatMap((row) => {
    const entry = numeric(row.entry_odds);
    const close = numeric(row.closing_odds);
    return entry !== null && close !== null && close > 0
      ? [(entry / close - 1) * 100]
      : [];
  });
  const averageClv =
    clvValues.length > 0
      ? clvValues.reduce((sum, value) => sum + value, 0) / clvValues.length
      : null;
  const roi = totalStake > 0 ? (pnl / totalStake) * 100 : null;
  const bank = INITIAL_BANK + pnl;

  return (
    <main className="ledger-page">
      <header className="subpage-nav">
        <a className="brand" href="/maurilio">
          <span className="brand-mark">M</span>
          <span><b>MAURILIO</b><small>QUANT FOOTBALL</small></span>
        </a>
        <a href="/maurilio" className="text-button">Volver al Matchday</a>
      </header>

      <section className="ledger-hero">
        <span className="section-kicker">LEDGER PÚBLICO</span>
        <h1>El historial no se edita.<br/><em>Se audita.</em></h1>
        <p>
          Cada selección liquidada conserva su precio Bet365 de entrada,
          probabilidad propia, cierre, CLV, resultado y P&amp;L.
        </p>
      </section>

      <section className="ledger-stats">
        <article>
          <small>BANCA</small>
          <strong>{hasRealLedger ? ars(bank) : ars(INITIAL_BANK)}</strong>
          <span>{hasRealLedger ? "ACTUALIZADA POR P&L" : "BASE PRE-LAUNCH"}</span>
        </article>
        <article>
          <small>P&L</small>
          <strong>{hasRealLedger ? ars(pnl) : "—"}</strong>
          <span>{hasRealLedger ? `${settled.length} PICKS LIQUIDADOS` : "SIN REGISTRO REAL AÚN"}</span>
        </article>
        <article>
          <small>ROI</small>
          <strong>{hasRealLedger ? pct(roi) : "—"}</strong>
          <span>RETORNO / STAKE REAL</span>
        </article>
        <article>
          <small>CLV MEDIO</small>
          <strong>{hasRealLedger ? pct(averageClv) : "—"}</strong>
          <span>CIERRE BET365</span>
        </article>
      </section>

      <section className="ledger-table-wrap">
        <div className="ledger-table-head">
          <div>
            <span className="section-kicker">AUDIT TRAIL</span>
            <h2>Selecciones registradas</h2>
          </div>
          <span className="demo-badge">
            {hasRealLedger
              ? "REGISTRO REAL · SOLO PICKS LIQUIDADOS"
              : "PRE-LAUNCH · SIN RESULTADOS REALES"}
          </span>
        </div>

        <div className="archive-table">
          <div className="archive-row archive-head">
            <span>ID</span><span>FECHA</span><span>EVENTO</span><span>MERCADO</span>
            <span>CUOTA</span><span>EDGE</span><span>CLV</span><span>RESULTADO</span><span>P&L</span>
          </div>
          {entries.map((entry) => (
            <div className="archive-row" key={entry.id}>
              <span>{entry.id}</span>
              <span>{entry.date}</span>
              <span>{entry.event}</span>
              <span>{entry.market}</span>
              <span>{entry.price}</span>
              <span>{entry.edge}</span>
              <span>{entry.clv}</span>
              <b>{entry.result}</b>
              <span>{entry.pnl}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="ledger-rule">
        <span>REGLA DE INTEGRIDAD</span>
        <p>
          Una predicción publicada nunca se reescribe retroactivamente.
          El resultado no convierte una mala decisión en buena, ni una pérdida
          convierte una decisión con valor en mala.
        </p>
      </section>
    </main>
  );
}
