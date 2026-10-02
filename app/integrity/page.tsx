import type { Metadata } from "next";
import {
  databaseConfigured,
  getAuditEvents,
  getLatestPublishedMatchday,
  getPublishedPickByTier,
  getRiskSnapshot,
  type MaurilioPickRow,
} from "@/lib/server/supabase-rest";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Integrity — Maurilio",
  description:
    "Reglas operativas verificables, estado del Matchday y trazabilidad del proceso cuantitativo Maurilio.",
};

type TierState = {
  tier: "free" | "pro" | "elite";
  id: string | null;
  published: boolean;
  sale: "open" | "closed" | "event_started" | "unavailable";
  eventStart: string | null;
  captured: boolean;
  robust: boolean;
};

function n(value: number | string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function tierState(
  tier: TierState["tier"],
  pick: MaurilioPickRow | null,
): TierState {
  if (!pick) {
    return {
      tier,
      id: null,
      published: false,
      sale: "unavailable",
      eventStart: null,
      captured: false,
      robust: false,
    };
  }

  const entry = n(pick.entry_odds);
  const low = n(pick.probability_low);
  const starts = pick.event_start_at
    ? new Date(pick.event_start_at).getTime()
    : Number.NaN;
  const started = Number.isFinite(starts) && starts <= Date.now();

  return {
    tier,
    id: pick.public_id,
    published: pick.status === "published",
    sale:
      pick.sale_status === "closed"
        ? "closed"
        : started
          ? "event_started"
          : "open",
    eventStart: pick.event_start_at,
    captured: Boolean(pick.odds_captured_at),
    robust: entry !== null && low !== null && entry * low > 1,
  };
}

function dateTime(value: string | null) {
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

function saleLabel(value: TierState["sale"]) {
  if (value === "open") return "ENTRY OPEN";
  if (value === "closed") return "RISK STOP";
  if (value === "event_started") return "EVENT STARTED";
  return "NO PICK";
}

export default async function IntegrityPage() {
  const configured = databaseConfigured();

  let active = null;
  let tiers: TierState[] = [
    tierState("free", null),
    tierState("pro", null),
    tierState("elite", null),
  ];
  let latestAudit: {
    event_type: string;
    entity_id: string;
    created_at: string;
  } | null = null;
  let bank: number | null = null;
  let settledCount = 0;

  if (configured) {
    try {
      active = await getLatestPublishedMatchday();

      if (active && !active.no_value) {
        const [free, pro, elite, audit, risk] = await Promise.all([
          getPublishedPickByTier(active.slug, "free"),
          getPublishedPickByTier(active.slug, "pro"),
          getPublishedPickByTier(active.slug, "elite"),
          getAuditEvents(1),
          getRiskSnapshot(),
        ]);

        tiers = [
          tierState("free", free),
          tierState("pro", pro),
          tierState("elite", elite),
        ];
        latestAudit = audit[0] ?? null;
        bank = n(risk.bank_ars);
        settledCount = risk.settled_count;
      } else {
        const [audit, risk] = await Promise.all([
          getAuditEvents(1),
          getRiskSnapshot(),
        ]);
        latestAudit = audit[0] ?? null;
        bank = n(risk.bank_ars);
        settledCount = risk.settled_count;
      }
    } catch {
      active = null;
    }
  }

  const systemState = !configured
    ? "PRE-LAUNCH"
    : active?.no_value
      ? "NO VALUE"
      : active
        ? "MATCHDAY PUBLISHED"
        : "OFF MARKET";

  return (
    <main className="integrity-page">
      <header className="subpage-nav">
        <a className="brand" href="/maurilio">
          <span className="brand-mark">M</span>
          <span><b>MAURILIO</b><small>PROOF OF PROCESS</small></span>
        </a>
        <nav className="nav-links" aria-label="Integrity">
          <a href="/maurilio">Matchday</a>
          <a href="/maurilio/access">Mis informes</a>
          <a href="/maurilio/archive">Registro</a>
        </nav>
      </header>

      <section className="integrity-hero">
        <span className="section-kicker">INTEGRITY / PROOF OF PROCESS</span>
        <h1>No pedimos confianza ciega.<br/><em>Mostramos las reglas.</em></h1>
        <p>
          Esta página expone el estado operativo sin revelar contenido premium:
          publicación, límites de riesgo, ventanas temporales y trazabilidad.
        </p>
      </section>

      <section className="integrity-status-grid">
        <article>
          <small>SISTEMA</small>
          <strong>{systemState}</strong>
          <span>{active?.label ?? "Sin Matchday activo"}</span>
        </article>
        <article>
          <small>BANCA AUDITADA</small>
          <strong>
            {bank === null
              ? "—"
              : new Intl.NumberFormat("es-AR", {
                  style: "currency",
                  currency: "ARS",
                  maximumFractionDigits: 0,
                }).format(bank)}
          </strong>
          <span>Derivada de P&L liquidado</span>
        </article>
        <article>
          <small>PICKS LIQUIDADOS</small>
          <strong>{settledCount}</strong>
          <span>Registro real</span>
        </article>
        <article>
          <small>ÚLTIMO EVENTO AUDITADO</small>
          <strong>{latestAudit?.event_type.replaceAll("_", " ").toUpperCase() ?? "—"}</strong>
          <span>{dateTime(latestAudit?.created_at ?? null)}</span>
        </article>
      </section>

      <section className="integrity-section">
        <div className="ledger-table-head">
          <div>
            <span className="section-kicker">CURRENT MATCHDAY</span>
            <h2>Estado por tier</h2>
          </div>
          <span className="demo-badge">SIN REVELAR SELECCIONES PREMIUM</span>
        </div>

        <div className="integrity-tier-grid">
          {tiers.map((item) => (
            <article className="integrity-tier-card" key={item.tier}>
              <div className="integrity-tier-head">
                <span>{item.tier.toUpperCase()}</span>
                <b className={item.sale === "open" ? "metric-positive" : ""}>
                  {saleLabel(item.sale)}
                </b>
              </div>
              <strong>{item.id ?? "NO PUBLICADO"}</strong>
              <div className="integrity-checks">
                <span>{item.published ? "✓" : "—"} PUBLICACIÓN REGISTRADA</span>
                <span>{item.captured ? "✓" : "—"} CAPTURA BET365</span>
                <span>{item.robust ? "✓" : "—"} EV POSITIVO EN PISO</span>
                <span>{item.eventStart ? "✓" : "—"} VENTANA DE EVENTO</span>
              </div>
              <small>Inicio: {dateTime(item.eventStart)}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="integrity-section">
        <span className="section-kicker">HARD RULES</span>
        <h2>Lo que el sistema no permite</h2>
        <div className="integrity-rules">
          <article><b>01</b><strong>BET365 ONLY</strong><p>La cuota publicada y el cierre pertenecen a Bet365; no se sustituye otra casa.</p></article>
          <article><b>02</b><strong>IMMUTABLE PICK</strong><p>Evento, mercado, precio, modelo, stake, tesis y riesgo no se reescriben después de publicar.</p></article>
          <article><b>03</b><strong>ROBUST LOWER BOUND</strong><p>Una señal publicada debe conservar EV positivo incluso en el límite inferior del rango.</p></article>
          <article><b>04</b><strong>MINIMUM PRICE</strong><p>La entrada debe superar la cuota mínima; si Bet365 cae debajo, existe un risk stop irreversible.</p></article>
          <article><b>05</b><strong>2% MAX / PICK</strong><p>El backend compara stake porcentual y ARS contra la banca viva antes de publicar.</p></article>
          <article><b>06</b><strong>6% MAX EXPOSURE</strong><p>La exposición simultánea total no puede superar el límite operativo.</p></article>
          <article><b>07</b><strong>EVENT CUTOFF</strong><p>No se publica ni se vende una señal después del inicio del evento.</p></article>
          <article><b>08</b><strong>APPEND-ONLY AUDIT</strong><p>Publicación, cierre de venta y liquidación generan eventos que no pueden editarse ni borrarse.</p></article>
        </div>
      </section>

      <section className="ledger-rule integrity-closing">
        <span>PRINCIPIO</span>
        <p>
          Una ganadora puede haber sido una mala compra y una perdedora puede
          haber tenido valor. La auditoría mira precio, probabilidad, CLV,
          riesgo y proceso; no sólo el resultado.
        </p>
      </section>
    </main>
  );
}
