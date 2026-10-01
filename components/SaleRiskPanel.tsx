"use client";

import { useCallback, useEffect, useState } from "react";

type Pick = {
  public_id: string;
  tier: "free" | "pro" | "elite";
  event: string;
  market: string;
  entry_odds: number | string | null;
  minimum_odds: number | string | null;
  event_start_at: string | null;
  sale_status: "open" | "closed";
  sale_closed_reason: string | null;
  last_observed_odds: number | string | null;
};

type Reason =
  | "price_below_minimum"
  | "market_unavailable"
  | "late_information"
  | "manual_risk_stop";

const BASE_PATH = "/maurilio";

const reasonLabels: Record<Reason, string> = {
  price_below_minimum: "Bet365 debajo de cuota mínima",
  market_unavailable: "Mercado no disponible",
  late_information: "Información tardía material",
  manual_risk_stop: "Risk stop manual",
};

export default function SaleRiskPanel() {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [reason, setReason] = useState<Record<string, Reason>>({});
  const [odds, setOdds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${BASE_PATH}/api/admin/matchday`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("load_failed");
      const data = (await response.json()) as { picks?: Pick[] };
      setPicks(Array.isArray(data.picks) ? data.picks : []);
    } catch {
      setError("No pudimos consultar el estado de ventas.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function closeSale(pick: Pick) {
    if (busy || pick.sale_status === "closed") return;

    const selectedReason = reason[pick.public_id] ?? "price_below_minimum";
    const observed = odds[pick.public_id] ?? "";

    if (selectedReason === "price_below_minimum" && !observed) {
      setError("Ingresá la cuota Bet365 observada para justificar el cierre por precio.");
      return;
    }

    setBusy(pick.public_id);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`${BASE_PATH}/api/admin/sale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicId: pick.public_id,
          reason: selectedReason,
          observedOdds: observed || null,
        }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "sale_stop_failed");
      }

      setMessage(
        `${pick.public_id} · venta cerrada de forma irreversible por ${reasonLabels[selectedReason]}.`,
      );
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? `Risk stop rechazado: ${err.message}`
          : "Risk stop rechazado.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="sale-risk-panel">
      <div className="settlement-head">
        <div>
          <span className="section-kicker">PRICE WATCH</span>
          <h2>Risk Stop de venta</h2>
        </div>
        <button type="button" className="text-button" onClick={() => void load()}>
          Actualizar
        </button>
      </div>

      <p className="sale-risk-intro">
        Si Bet365 corrige el precio por debajo de la cuota mínima o aparece información
        material, cerrá la entrada. El pick publicado no se modifica y compradores ya
        acreditados conservan acceso.
      </p>

      <div className="sale-risk-list">
        {picks.length === 0 ? (
          <div className="settlement-empty">No hay picks publicados activos.</div>
        ) : (
          picks.map((pick) => {
            const closed = pick.sale_status === "closed";
            return (
              <article className={closed ? "sale-risk-row is-closed" : "sale-risk-row"} key={pick.public_id}>
                <div className="settlement-pick">
                  <small>{pick.tier.toUpperCase()} · {pick.public_id}</small>
                  <b>{pick.event}</b>
                  <span>{pick.market}</span>
                </div>

                <div className="settlement-entry">
                  <small>ENTRADA / MÍNIMA</small>
                  <b>
                    @{pick.entry_odds ? Number(pick.entry_odds).toFixed(2) : "—"} /{" "}
                    {pick.minimum_odds ? Number(pick.minimum_odds).toFixed(2) : "—"}
                  </b>
                  <span>
                    {closed
                      ? `CERRADA · ${pick.sale_closed_reason ?? "risk stop"}`
                      : "VENTA ABIERTA"}
                  </span>
                </div>

                {closed ? (
                  <div className="sale-closed-proof">
                    <b>ENTRY CLOSED</b>
                    <span>
                      {pick.last_observed_odds
                        ? `Bet365 observada @${Number(pick.last_observed_odds).toFixed(2)}`
                        : "Sin precio observado"}
                    </span>
                  </div>
                ) : (
                  <>
                    <label>
                      Motivo
                      <select
                        value={reason[pick.public_id] ?? "price_below_minimum"}
                        onChange={(event) =>
                          setReason((prev) => ({
                            ...prev,
                            [pick.public_id]: event.target.value as Reason,
                          }))
                        }
                      >
                        {Object.entries(reasonLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Bet365 observada
                      <input
                        inputMode="decimal"
                        placeholder="1.65"
                        value={odds[pick.public_id] ?? ""}
                        onChange={(event) =>
                          setOdds((prev) => ({
                            ...prev,
                            [pick.public_id]: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <button
                      type="button"
                      className="risk-stop-button"
                      disabled={busy === pick.public_id}
                      onClick={() => void closeSale(pick)}
                    >
                      {busy === pick.public_id ? "Cerrando…" : "Cerrar entrada"}
                    </button>
                  </>
                )}
              </article>
            );
          })
        )}
      </div>

      {message && <div className="control-success">{message}</div>}
      {error && <div className="checkout-error">{error}</div>}

      <p className="control-footnote">
        El cierre es irreversible. Para “precio debajo de mínima”, el servidor exige
        una cuota Bet365 observada estrictamente menor que la cuota mínima publicada.
      </p>
    </section>
  );
}
