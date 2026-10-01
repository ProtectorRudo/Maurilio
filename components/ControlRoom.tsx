"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Tier = "free" | "pro" | "elite";

type PickDraft = {
  enabled: boolean;
  publicId: string;
  tier: Tier;
  competition: string;
  event: string;
  market: string;
  selection: string;
  entryOdds: string;
  minimumOdds: string;
  probabilityOwn: string;
  probabilityLow: string;
  probabilityHigh: string;
  stakePct: string;
  stakeArs: string;
  thesis: string;
  principalRisk: string;
  oddsCapturedAt: string;
  eventStartAt: string;
};

type MatchdayDraft = {
  slug: string;
  matchDate: string;
  label: string;
  noValue: boolean;
};

type RiskSnapshot = {
  initial_bank_ars: number | string;
  bank_ars: number | string;
  pnl_ars: number | string;
  settled_stake_ars: number | string;
  roi: number | string | null;
  avg_clv: number | string | null;
  settled_count: number;
  open_stake_ars: number | string;
  open_count: number;
  open_exposure_pct: number | string | null;
};

const BASE_PATH = "/maurilio";

function localDateTimeInput() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function localInputFromIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function todayInput() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function pickTemplate(tier: Tier, index: number, date = todayInput()): PickDraft {
  const defaults = {
    free: { probabilityOwn: "60", probabilityLow: "55", probabilityHigh: "65", stakePct: "0.75" },
    pro: { probabilityOwn: "62", probabilityLow: "57", probabilityHigh: "67", stakePct: "1.25" },
    elite: { probabilityOwn: "65", probabilityLow: "60", probabilityHigh: "70", stakePct: "1.75" },
  }[tier];

  return {
    enabled: tier === "free",
    publicId: `M-${date.replaceAll("-", "")}-${tier.toUpperCase()}`,
    tier,
    competition: "",
    event: "",
    market: "",
    selection: "",
    entryOdds: "",
    minimumOdds: "",
    probabilityOwn: defaults.probabilityOwn,
    probabilityLow: defaults.probabilityLow,
    probabilityHigh: defaults.probabilityHigh,
    stakePct: defaults.stakePct,
    stakeArs: "",
    thesis: "",
    principalRisk: "",
    oddsCapturedAt: localDateTimeInput(),
    eventStartAt: "",
  };
}

function metricValues(pick: PickDraft) {
  const odds = Number(pick.entryOdds);
  const own = Number(pick.probabilityOwn);
  const low = Number(pick.probabilityLow);
  const implied = odds > 1 ? 100 / odds : 0;
  const edge = own - implied;
  const ev = odds > 1 ? (own / 100) * odds * 100 - 100 : 0;
  const lowerEv = odds > 1 ? (low / 100) * odds * 100 - 100 : 0;
  return { implied, edge, ev, lowerEv };
}

function numberField(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function ars(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

function percent(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return `${numeric >= 0 ? "+" : ""}${(numeric * 100).toFixed(2)}%`;
}

export default function ControlRoom() {
  const date = todayInput();
  const [matchday, setMatchday] = useState<MatchdayDraft>({
    slug: date,
    matchDate: date,
    label: `${date} · MATCHDAY`,
    noValue: false,
  });
  const [picks, setPicks] = useState<PickDraft[]>([
    pickTemplate("free", 1),
    pickTemplate("pro", 2),
    pickTemplate("elite", 3),
  ]);
  const [activeTier, setActiveTier] = useState<Tier>("free");
  const [publishedLocked, setPublishedLocked] = useState(false);
  const [risk, setRisk] = useState<RiskSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activePick = picks.find((pick) => pick.tier === activeTier)!;
  const metrics = useMemo(() => metricValues(activePick), [activePick]);

  useEffect(() => {
    fetch(`${BASE_PATH}/api/admin/matchday`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{
          matchday: {
            slug: string;
            match_date: string;
            label: string;
            no_value: boolean;
          } | null;
          picks: Array<Record<string, unknown>>;
          risk: RiskSnapshot | null;
        }>;
      })
      .then((data) => {
        if (!data) return;
        setRisk(data.risk ?? null);
        if (!data.matchday) return;

        setPublishedLocked(true);
        setMatchday({
          slug: data.matchday.slug,
          matchDate: data.matchday.match_date,
          label: data.matchday.label,
          noValue: Boolean(data.matchday.no_value),
        });

        if (data.picks.length > 0) {
          setPicks((existing) =>
            existing.map((fallback) => {
              const row = data.picks.find((item) => item.tier === fallback.tier);
              if (!row) return { ...fallback, enabled: false };

              const decimalPercent = (value: unknown) => {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? String(parsed * 100) : "";
              };

              return {
                ...fallback,
                enabled: true,
                publicId: String(row.public_id ?? fallback.publicId),
                competition: String(row.competition ?? ""),
                event: String(row.event ?? ""),
                market: String(row.market ?? ""),
                selection: String(row.selection ?? ""),
                entryOdds: String(row.entry_odds ?? ""),
                minimumOdds: String(row.minimum_odds ?? ""),
                probabilityOwn: decimalPercent(row.probability_own),
                probabilityLow: decimalPercent(row.probability_low),
                probabilityHigh: decimalPercent(row.probability_high),
                stakePct: decimalPercent(row.stake_pct),
                stakeArs: row.stake_ars === null || row.stake_ars === undefined ? "" : String(row.stake_ars),
                thesis: String(row.thesis ?? ""),
                principalRisk: String(row.principal_risk ?? ""),
                oddsCapturedAt:
                  typeof row.odds_captured_at === "string"
                    ? localInputFromIso(String(row.odds_captured_at))
                    : localDateTimeInput(),
                eventStartAt:
                  typeof row.event_start_at === "string"
                    ? localInputFromIso(String(row.event_start_at))
                    : "",
              };
            }),
          );
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function updateMatchday<K extends keyof MatchdayDraft>(
    key: K,
    value: MatchdayDraft[K],
  ) {
    setStatus(null);
    setError(null);
    setMatchday((prev) => ({ ...prev, [key]: value }));
  }

  function updatePick<K extends keyof PickDraft>(
    tier: Tier,
    key: K,
    value: PickDraft[K],
  ) {
    setStatus(null);
    setError(null);
    setPicks((prev) =>
      prev.map((pick) =>
        pick.tier === tier ? { ...pick, [key]: value } : pick,
      ),
    );
  }

  function startNextDraft() {
    const base = new Date(`${matchday.matchDate}T12:00:00`);
    base.setDate(base.getDate() + 1);
    const next = new Date(base.getTime() - base.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 10);

    setMatchday({
      slug: next,
      matchDate: next,
      label: `${next} · MATCHDAY`,
      noValue: false,
    });
    setPicks([
      pickTemplate("free", 1, next),
      pickTemplate("pro", 2, next),
      pickTemplate("elite", 3, next),
    ]);
    setActiveTier("free");
    setPublishedLocked(false);
    setError(null);
    setStatus("Nuevo borrador preparado. La jornada anterior sigue siendo inmutable.");
  }

  function saveLocal() {
    localStorage.setItem(
      "maurilio-control-room-draft-v2",
      JSON.stringify({ matchday, picks }),
    );
    setStatus("Borrador guardado en este navegador.");
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (publishing) return;
    setPublishing(true);
    setStatus(null);
    setError(null);

    const enabledPicks = matchday.noValue
      ? []
      : picks.filter((pick) => pick.enabled);

    try {
      const payload = {
        slug: matchday.slug,
        matchDate: matchday.matchDate,
        label: matchday.label,
        noValue: matchday.noValue,
        picks: enabledPicks.map((pick) => ({
          publicId: pick.publicId,
          tier: pick.tier,
          sport: "football",
          competition: pick.competition,
          event: pick.event,
          market: pick.market,
          selection: pick.selection,
          entryOdds: numberField(pick.entryOdds),
          minimumOdds: numberField(pick.minimumOdds),
          probabilityOwn:
            numberField(pick.probabilityOwn) === null
              ? null
              : Number(pick.probabilityOwn) / 100,
          probabilityLow:
            numberField(pick.probabilityLow) === null
              ? null
              : Number(pick.probabilityLow) / 100,
          probabilityHigh:
            numberField(pick.probabilityHigh) === null
              ? null
              : Number(pick.probabilityHigh) / 100,
          stakePct:
            numberField(pick.stakePct) === null
              ? null
              : Number(pick.stakePct) / 100,
          stakeArs: numberField(pick.stakeArs),
          thesis: pick.thesis,
          principalRisk: pick.principalRisk,
          oddsCapturedAt: new Date(pick.oddsCapturedAt).toISOString(),
          eventStartAt: new Date(pick.eventStartAt).toISOString(),
        })),
      };

      const response = await fetch(`${BASE_PATH}/api/admin/matchday`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        publishedPicks?: number;
        noValue?: boolean;
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "publish_failed");
      }

      setStatus(
        data.noValue
          ? "Matchday publicado como NO VALUE."
          : `Matchday publicado con ${data.publishedPicks ?? 0} pick(s).`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? `Publicación rechazada: ${err.message}`
          : "Publicación rechazada.",
      );
    } finally {
      setPublishing(false);
    }
  }

  async function logout() {
    await fetch(`${BASE_PATH}/api/admin/session`, { method: "DELETE" });
    window.location.reload();
  }

  if (loading) {
    return <div className="control-loading">Cargando estado operativo…</div>;
  }

  return (
    <form className={publishedLocked ? "control-ops is-published" : "control-ops"} onSubmit={publish}>
      {risk && (
        <section className="control-risk-strip">
          <article><small>BANCA VIVA</small><b>{ars(risk.bank_ars)}</b></article>
          <article><small>P&L</small><b>{ars(risk.pnl_ars)}</b></article>
          <article><small>ROI</small><b>{percent(risk.roi)}</b></article>
          <article><small>CLV MEDIO</small><b>{percent(risk.avg_clv)}</b></article>
          <article><small>EXPOSICIÓN ABIERTA</small><b>{percent(risk.open_exposure_pct)}</b></article>
          <article><small>PICKS LIQUIDADOS</small><b>{risk.settled_count}</b></article>
        </section>
      )}

      {publishedLocked && (
        <section className="published-lock-banner">
          <div>
            <span>PUBLICATION LOCK</span>
            <b>MATCHDAY PUBLICADO · INMUTABLE</b>
          </div>
          <p>
            Los datos publicados ya no pueden editarse. Liquidá los picks abiertos
            o prepará el siguiente borrador.
          </p>
        </section>
      )}

      <section className="control-matchday-bar">
        <div>
          <span className="section-kicker">MATCHDAY</span>
          <label>
            Fecha
            <input
              type="date"
              value={matchday.matchDate}
              onChange={(event) => {
                updateMatchday("matchDate", event.target.value);
                updateMatchday("slug", event.target.value);
              }}
            />
          </label>
        </div>
        <label>
          Slug
          <input
            value={matchday.slug}
            onChange={(event) => updateMatchday("slug", event.target.value)}
          />
        </label>
        <label>
          Etiqueta pública
          <input
            value={matchday.label}
            onChange={(event) => updateMatchday("label", event.target.value)}
          />
        </label>
        <label className="no-value-toggle">
          <input
            type="checkbox"
            checked={matchday.noValue}
            onChange={(event) => updateMatchday("noValue", event.target.checked)}
          />
          <span>
            <b>NO VALUE</b>
            Publicar jornada sin apuestas
          </span>
        </label>
      </section>

      {!matchday.noValue && (
        <>
          <div className="tier-editor-tabs">
            {picks.map((pick) => (
              <button
                type="button"
                key={pick.tier}
                className={activeTier === pick.tier ? "active" : ""}
                onClick={() => setActiveTier(pick.tier)}
              >
                {pick.tier.toUpperCase()}
                <span>{pick.enabled ? "ON" : "OFF"}</span>
              </button>
            ))}
          </div>

          <section className="control-grid">
            <div className="control-form">
              <div className="control-form-head">
                <span>{activePick.tier === "free" ? "01" : activePick.tier === "pro" ? "02" : "03"}</span>
                <div>
                  <small>{activePick.tier.toUpperCase()} ANALYSIS</small>
                  <h2>Editor cuantitativo</h2>
                </div>
                <label className="pick-enabled">
                  <input
                    type="checkbox"
                    checked={activePick.enabled}
                    onChange={(event) =>
                      updatePick(activeTier, "enabled", event.target.checked)
                    }
                  />
                  PUBLICAR
                </label>
              </div>

              <div className="control-pair">
                <label>
                  ID público
                  <input
                    value={activePick.publicId}
                    onChange={(e) => updatePick(activeTier, "publicId", e.target.value)}
                  />
                </label>
                <label>
                  Competencia
                  <input
                    value={activePick.competition}
                    onChange={(e) => updatePick(activeTier, "competition", e.target.value)}
                  />
                </label>
              </div>

              <label>
                Evento
                <input
                  value={activePick.event}
                  onChange={(e) => updatePick(activeTier, "event", e.target.value)}
                />
              </label>

              <div className="control-pair">
                <label>
                  Mercado
                  <input
                    value={activePick.market}
                    onChange={(e) => updatePick(activeTier, "market", e.target.value)}
                  />
                </label>
                <label>
                  Selección
                  <input
                    value={activePick.selection}
                    onChange={(e) => updatePick(activeTier, "selection", e.target.value)}
                  />
                </label>
              </div>

              <div className="control-pair">
                <label>
                  Cuota Bet365
                  <input
                    inputMode="decimal"
                    value={activePick.entryOdds}
                    onChange={(e) => updatePick(activeTier, "entryOdds", e.target.value)}
                  />
                </label>
                <label>
                  Cuota mínima
                  <input
                    inputMode="decimal"
                    value={activePick.minimumOdds}
                    onChange={(e) => updatePick(activeTier, "minimumOdds", e.target.value)}
                  />
                </label>
              </div>

              <div className="control-triple">
                <label>
                  Prob. propia %
                  <input
                    inputMode="decimal"
                    value={activePick.probabilityOwn}
                    onChange={(e) => updatePick(activeTier, "probabilityOwn", e.target.value)}
                  />
                </label>
                <label>
                  Rango bajo %
                  <input
                    inputMode="decimal"
                    value={activePick.probabilityLow}
                    onChange={(e) => updatePick(activeTier, "probabilityLow", e.target.value)}
                  />
                </label>
                <label>
                  Rango alto %
                  <input
                    inputMode="decimal"
                    value={activePick.probabilityHigh}
                    onChange={(e) => updatePick(activeTier, "probabilityHigh", e.target.value)}
                  />
                </label>
              </div>

              <div className="control-triple">
                <label>
                  Stake %
                  <input
                    inputMode="decimal"
                    value={activePick.stakePct}
                    onChange={(e) => {
                      const next = e.target.value;
                      updatePick(activeTier, "stakePct", next);
                      const bank = Number(risk?.bank_ars ?? 0);
                      const pct = Number(next);
                      if (Number.isFinite(bank) && bank > 0 && Number.isFinite(pct)) {
                        updatePick(
                          activeTier,
                          "stakeArs",
                          String(Math.round(bank * (pct / 100))),
                        );
                      }
                    }}
                  />
                </label>
                <label>
                  Stake ARS
                  <input
                    inputMode="decimal"
                    value={activePick.stakeArs}
                    onChange={(e) => updatePick(activeTier, "stakeArs", e.target.value)}
                  />
                </label>
                <label>
                  Captura Bet365
                  <input
                    type="datetime-local"
                    value={activePick.oddsCapturedAt}
                    onChange={(e) => updatePick(activeTier, "oddsCapturedAt", e.target.value)}
                  />
                </label>
              </div>

              <label>
                Inicio del evento
                <input
                  type="datetime-local"
                  value={activePick.eventStartAt}
                  onChange={(e) => updatePick(activeTier, "eventStartAt", e.target.value)}
                  required={activePick.enabled}
                />
              </label>

              <label>
                Tesis
                <textarea
                  rows={4}
                  value={activePick.thesis}
                  onChange={(e) => updatePick(activeTier, "thesis", e.target.value)}
                />
              </label>

              <label>
                Mejor razón para NO apostar
                <textarea
                  rows={4}
                  value={activePick.principalRisk}
                  onChange={(e) => updatePick(activeTier, "principalRisk", e.target.value)}
                />
              </label>
            </div>

            <aside className="control-preview">
              <span className="section-kicker">LIVE AUDIT</span>
              <h3>{activePick.event || "Evento sin cargar"}</h3>
              <div className="preview-market">
                <small>MERCADO</small>
                <b>{activePick.market || "—"}</b>
                <strong>@{activePick.entryOdds || "—"}</strong>
              </div>
              <div className="preview-metrics">
                <div><small>IMPLÍCITA</small><b>{metrics.implied.toFixed(1)}%</b></div>
                <div><small>MODELO</small><b>{Number(activePick.probabilityOwn || 0).toFixed(1)}%</b></div>
                <div><small>EDGE</small><b className={metrics.edge > 0 ? "metric-positive" : ""}>{metrics.edge >= 0 ? "+" : ""}{metrics.edge.toFixed(1)}%</b></div>
                <div><small>EV</small><b className={metrics.ev > 0 ? "metric-positive" : ""}>{metrics.ev >= 0 ? "+" : ""}{metrics.ev.toFixed(1)}%</b></div>
                <div><small>EV PISO</small><b className={metrics.lowerEv > 0 ? "metric-positive" : "metric-negative"}>{metrics.lowerEv >= 0 ? "+" : ""}{metrics.lowerEv.toFixed(1)}%</b></div>
                <div><small>SEÑAL</small><b className={metrics.lowerEv > 0 ? "metric-positive" : "metric-negative"}>{metrics.lowerEv > 0 ? "ROBUSTA" : "FRÁGIL"}</b></div>
              </div>
              <div className="preview-event-time">
                <small>INICIO EVENTO</small>
                <p>{activePick.eventStartAt ? new Date(activePick.eventStartAt).toLocaleString("es-AR") : "Pendiente."}</p>
              </div>
              <div className="preview-thesis">
                <small>TESIS</small>
                <p>{activePick.thesis || "Pendiente."}</p>
              </div>
              <div className="preview-risk">
                <small>ADVERSARIAL CHECK</small>
                <p>{activePick.principalRisk || "Pendiente."}</p>
              </div>
              {risk && (
                <div className="preview-risk-budget">
                  <small>RISK BUDGET</small>
                  <p>
                    Máx. por pick: {ars(Number(risk.bank_ars) * 0.02)} ·
                    Máx. simultáneo: {ars(Number(risk.bank_ars) * 0.06)}
                  </p>
                </div>
              )}
            </aside>
          </section>
        </>
      )}

      {matchday.noValue && (
        <section className="control-no-value">
          <span>QUANT DECISION</span>
          <h2>HOY NO HAY APUESTA CON SUFICIENTE VALOR</h2>
          <p>
            Se publicará una jornada real con exposición 0%. Los tiers premium
            quedarán automáticamente sin producto.
          </p>
        </section>
      )}

      <section className="control-actions">
        <button type="button" className="text-button" onClick={saveLocal}>
          Guardar borrador local
        </button>
        {publishedLocked && (
          <button type="button" className="text-button" onClick={startNextDraft}>
            Crear siguiente borrador
          </button>
        )}
        <button
          type="submit"
          className="primary-button"
          disabled={publishing || publishedLocked}
        >
          {publishedLocked
            ? "Matchday ya publicado"
            : publishing
              ? "Publicando…"
              : "Publicar Matchday"}
        </button>
        <button type="button" className="text-button" onClick={logout}>
          Cerrar sesión
        </button>
      </section>

      {status && <div className="control-success">{status}</div>}
      {error && <div className="checkout-error">{error}</div>}

      <p className="control-footnote">
        La publicación es atómica. Si cualquier pick viola Bet365, cuota mínima,
        EV central, EV del límite inferior, rango, stake o auditoría, no se publica ningún cambio.
      </p>
    </form>
  );
}
