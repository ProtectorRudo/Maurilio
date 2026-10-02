import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  databaseConfigured,
  getEntitledPickByTier,
  getMatchdayBySlug,
  hasActiveEntitlement,
} from "@/lib/server/supabase-rest";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Informe premium — Maurilio",
  robots: { index: false, follow: false, noarchive: true },
};

const ACCESS_COOKIE = "maurilio_sid";

function validUuid(value: string | undefined) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
}

function numberOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pct(value: number | null, digits = 1) {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
}

function odds(value: number | null) {
  return value === null ? "—" : `@${value.toFixed(2)}`;
}

function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return (
    new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date) + " ART"
  );
}

function ars(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function HistoricalReportPage({
  searchParams,
}: {
  searchParams: Promise<{ matchday?: string; tier?: string }>;
}) {
  const params = await searchParams;
  const matchdaySlug =
    typeof params.matchday === "string" ? params.matchday.trim() : "";
  const tier = params.tier === "pro" || params.tier === "elite" ? params.tier : null;

  if (
    !tier ||
    !matchdaySlug ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(matchdaySlug) ||
    !databaseConfigured()
  ) {
    notFound();
  }

  const store = await cookies();
  const subjectId = store.get(ACCESS_COOKIE)?.value;
  if (!validUuid(subjectId)) notFound();

  const entitled = await hasActiveEntitlement(
    subjectId!,
    matchdaySlug,
    tier,
  ).catch(() => false);

  if (!entitled) notFound();

  const [matchday, pick] = await Promise.all([
    getMatchdayBySlug(matchdaySlug),
    getEntitledPickByTier(matchdaySlug, tier),
  ]);

  if (!matchday || !pick) notFound();

  const entry = numberOrNull(pick.entry_odds);
  const minimum = numberOrNull(pick.minimum_odds);
  const own = numberOrNull(pick.probability_own);
  const low = numberOrNull(pick.probability_low);
  const high = numberOrNull(pick.probability_high);
  const stake = numberOrNull(pick.stake_pct);
  const closing = numberOrNull(pick.closing_odds);
  const pnl = numberOrNull(pick.pnl_ars);
  const implied = entry ? 1 / entry : null;
  const edge = own !== null && implied !== null ? own - implied : null;
  const ev = own !== null && entry !== null ? own * entry - 1 : null;
  const lowerEv = low !== null && entry !== null ? low * entry - 1 : null;

  return (
    <main className="historical-report-page">
      <header className="subpage-nav">
        <a className="brand" href="/maurilio/access">
          <span className="brand-mark">M</span>
          <span><b>MAURILIO</b><small>VERIFIED REPORT</small></span>
        </a>
        <nav className="nav-links" aria-label="Informe">
          <a href="/maurilio/access">Mis informes</a>
          <a href="/maurilio/integrity">Integridad</a>
        </nav>
      </header>

      <section className="historical-report">
        <div className="historical-report-head">
          <div>
            <span className="section-kicker">{tier.toUpperCase()} / ACCESS VERIFIED</span>
            <h1>{pick.event}</h1>
            <p>{pick.competition}</p>
          </div>
          <div className="immutable-badge">
            <span>IMMUTABLE</span>
            <b>{pick.public_id}</b>
          </div>
        </div>

        <div className="historical-market">
          <small>MERCADO</small>
          <strong>{pick.market}</strong>
          {pick.selection && <b>{pick.selection}</b>}
        </div>

        <section className="historical-metrics">
          <article><small>ENTRADA BET365</small><b>{odds(entry)}</b></article>
          <article><small>CUOTA MÍNIMA</small><b>{odds(minimum)}</b></article>
          <article><small>IMPLÍCITA</small><b>{pct(implied)}</b></article>
          <article><small>PROB. PROPIA</small><b>{pct(own)}</b></article>
          <article><small>EDGE</small><b>{pct(edge)}</b></article>
          <article><small>EV</small><b>{pct(ev)}</b></article>
          <article><small>EV PISO</small><b>{pct(lowerEv)}</b></article>
          <article><small>STAKE</small><b>{pct(stake)}</b></article>
        </section>

        <div className="historical-range">
          <span>RANGO DEL MODELO</span>
          <b>{low === null || high === null ? "—" : `${pct(low)} — ${pct(high)}`}</b>
        </div>

        <section className="historical-thesis-grid">
          <article>
            <small>TESIS</small>
            <p>{pick.thesis ?? "—"}</p>
          </article>
          <article>
            <small>MEJOR RAZÓN PARA NO ENTRAR</small>
            <p>{pick.principal_risk ?? "—"}</p>
          </article>
        </section>

        <section className="historical-proof-grid">
          <article><small>CAPTURA BET365</small><b>{dateTime(pick.odds_captured_at)}</b></article>
          <article><small>INICIO EVENTO</small><b>{dateTime(pick.event_start_at)}</b></article>
          <article><small>PUBLICADO</small><b>{dateTime(pick.published_at)}</b></article>
          <article><small>ESTADO MATCHDAY</small><b>{matchday.status.toUpperCase()}</b></article>
        </section>

        {pick.sale_status === "closed" && (
          <section className="historical-risk-stop">
            <span>ENTRY CLOSED</span>
            <b>{pick.sale_closed_reason?.replaceAll("_", " ").toUpperCase()}</b>
            <p>
              {pick.last_observed_odds
                ? `Última Bet365 observada ${odds(numberOrNull(pick.last_observed_odds))}`
                : "Cierre operativo sin precio observado."}
            </p>
          </section>
        )}

        {pick.status === "settled" && (
          <section className="historical-settlement">
            <div><small>RESULTADO</small><b>{pick.result?.toUpperCase() ?? "—"}</b></div>
            <div><small>CIERRE BET365</small><b>{odds(closing)}</b></div>
            <div><small>P&L</small><b>{ars(pnl)}</b></div>
            <div><small>LIQUIDADO</small><b>{dateTime(pick.settled_at)}</b></div>
          </section>
        )}

        <div className="ledger-rule">
          <span>INTEGRIDAD</span>
          <p>
            Este informe corresponde exactamente al Matchday comprado. El
            contenido publicado no puede reescribirse después de su publicación.
          </p>
        </div>
      </section>
    </main>
  );
}
