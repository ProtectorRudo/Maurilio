"use client";

import { useCallback, useEffect, useState } from "react";

type AuditEvent = {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  created_at: string;
};

const BASE_PATH = "/maurilio";

const eventLabels: Record<string, string> = {
  matchday_published: "MATCHDAY PUBLISHED",
  pick_published: "PICK PUBLISHED",
  sale_closed: "ENTRY CLOSED",
  pick_settled: "PICK SETTLED",
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date) + " ART";
}

function odds(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? `@${n.toFixed(2)}` : null;
}

function eventSummary(event: AuditEvent) {
  const p = event.payload;

  if (event.event_type === "pick_published") {
    return [
      typeof p.tier === "string" ? p.tier.toUpperCase() : null,
      typeof p.event === "string" ? p.event : null,
      typeof p.market === "string" ? p.market : null,
      odds(p.entry_odds),
      p.minimum_odds ? `MIN ${odds(p.minimum_odds)}` : null,
    ].filter(Boolean).join(" · ");
  }

  if (event.event_type === "sale_closed") {
    return [
      typeof p.reason === "string" ? p.reason.replaceAll("_", " ").toUpperCase() : null,
      p.observed_odds ? `BET365 ${odds(p.observed_odds)}` : null,
      p.minimum_odds ? `MIN ${odds(p.minimum_odds)}` : null,
    ].filter(Boolean).join(" · ");
  }

  if (event.event_type === "pick_settled") {
    const pnl = Number(p.pnl_ars);
    return [
      typeof p.result === "string" ? p.result.toUpperCase() : null,
      p.closing_odds ? `CLOSE ${odds(p.closing_odds)}` : null,
      Number.isFinite(pnl)
        ? `P&L ${new Intl.NumberFormat("es-AR", {
            style: "currency",
            currency: "ARS",
            maximumFractionDigits: 0,
          }).format(pnl)}`
        : null,
    ].filter(Boolean).join(" · ");
  }

  if (event.event_type === "matchday_published") {
    return [
      typeof p.label === "string" ? p.label : null,
      p.no_value === true ? "NO VALUE" : "ACTIVE",
    ].filter(Boolean).join(" · ");
  }

  return event.entity_type.toUpperCase();
}

export default function AuditTimeline() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BASE_PATH}/api/admin/audit?limit=100`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("audit_load_failed");
      const data = (await response.json()) as { events?: AuditEvent[] };
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch {
      setError("No pudimos cargar la trazabilidad operacional.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="audit-panel">
      <div className="settlement-head">
        <div>
          <span className="section-kicker">IMMUTABLE LOG</span>
          <h2>Audit Timeline</h2>
        </div>
        <button type="button" className="text-button" onClick={() => void load()}>
          Actualizar
        </button>
      </div>

      <p className="sale-risk-intro">
        Publicaciones, cierres de entrada y liquidaciones quedan registradas
        en un log append-only protegido por Postgres.
      </p>

      {loading ? (
        <div className="control-loading">Leyendo audit trail…</div>
      ) : error ? (
        <div className="checkout-error">{error}</div>
      ) : events.length === 0 ? (
        <div className="settlement-empty">Todavía no hay eventos auditables.</div>
      ) : (
        <div className="audit-list">
          {events.map((event) => (
            <article className="audit-event" key={event.id}>
              <div className="audit-dot" aria-hidden="true" />
              <div className="audit-event-main">
                <div className="audit-event-head">
                  <b>{eventLabels[event.event_type] ?? event.event_type.toUpperCase()}</b>
                  <time>{formatTime(event.created_at)}</time>
                </div>
                <strong>{event.entity_id}</strong>
                <p>{eventSummary(event)}</p>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="control-footnote">
        El Control Room sólo lee este registro. Las filas no pueden actualizarse
        ni eliminarse, ni siquiera mediante las operaciones normales del backend.
      </p>
    </section>
  );
}
