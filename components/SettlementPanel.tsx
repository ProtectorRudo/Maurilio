"use client";

import { useCallback, useEffect, useState } from "react";

type OpenPick = {
  public_id: string;
  tier: "free" | "pro" | "elite";
  event: string;
  market: string;
  selection: string | null;
  entry_odds: number | string | null;
  stake_ars: number | string | null;
};

const BASE_PATH = "/maurilio";

export default function SettlementPanel() {
  const [picks, setPicks] = useState<OpenPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resultById, setResultById] = useState<Record<string, string>>({});
  const [closingById, setClosingById] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${BASE_PATH}/api/admin/matchday`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("load_failed");
      const data = (await response.json()) as { picks?: OpenPick[] };
      setPicks(Array.isArray(data.picks) ? data.picks : []);
    } catch {
      setError("No pudimos cargar los picks abiertos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function settle(publicId: string) {
    if (busyId) return;
    const result = resultById[publicId] || "";
    const closing = closingById[publicId] || "";

    if (!result) {
      setError("Elegí un resultado antes de liquidar.");
      return;
    }
    if (result !== "void" && !closing) {
      setError("La cuota de cierre Bet365 es obligatoria.");
      return;
    }

    setBusyId(publicId);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`${BASE_PATH}/api/admin/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicId,
          result,
          closingOdds: closing || null,
        }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        settlement?: {
          pnl_ars?: number;
          matchday_status?: string;
        };
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "settlement_failed");
      }

      const pnl = Number(data.settlement?.pnl_ars ?? 0);
      const formatted = new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 0,
      }).format(pnl);

      setMessage(
        `${publicId} liquidado · P&L ${formatted} · Matchday ${data.settlement?.matchday_status ?? "updated"}`,
      );
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? `Liquidación rechazada: ${err.message}`
          : "Liquidación rechazada.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="settlement-panel">
      <div className="settlement-head">
        <div>
          <span className="section-kicker">POST-MATCH</span>
          <h2>Liquidación & CLV</h2>
        </div>
        <button type="button" className="text-button" onClick={() => void load()}>
          Actualizar
        </button>
      </div>

      {loading ? (
        <div className="control-loading">Consultando picks abiertos…</div>
      ) : picks.length === 0 ? (
        <div className="settlement-empty">
          No hay picks publicados pendientes de liquidación.
        </div>
      ) : (
        <div className="settlement-list">
          {picks.map((pick) => (
            <article className="settlement-row" key={pick.public_id}>
              <div className="settlement-pick">
                <small>{pick.tier.toUpperCase()} · {pick.public_id}</small>
                <b>{pick.event}</b>
                <span>
                  {pick.market}
                  {pick.selection ? ` · ${pick.selection}` : ""}
                </span>
              </div>
              <div className="settlement-entry">
                <small>ENTRADA BET365</small>
                <b>{pick.entry_odds ? `@${Number(pick.entry_odds).toFixed(2)}` : "—"}</b>
                <span>
                  Stake {pick.stake_ars ? `$ ${Number(pick.stake_ars).toLocaleString("es-AR")}` : "—"}
                </span>
              </div>
              <label>
                Resultado
                <select
                  value={resultById[pick.public_id] || ""}
                  onChange={(event) =>
                    setResultById((prev) => ({
                      ...prev,
                      [pick.public_id]: event.target.value,
                    }))
                  }
                >
                  <option value="">Elegir</option>
                  <option value="win">WIN</option>
                  <option value="loss">LOSS</option>
                  <option value="push">PUSH</option>
                  <option value="void">VOID</option>
                </select>
              </label>
              <label>
                Cierre Bet365
                <input
                  inputMode="decimal"
                  placeholder="1.78"
                  value={closingById[pick.public_id] || ""}
                  onChange={(event) =>
                    setClosingById((prev) => ({
                      ...prev,
                      [pick.public_id]: event.target.value,
                    }))
                  }
                />
              </label>
              <button
                type="button"
                className="primary-button settlement-button"
                disabled={busyId === pick.public_id}
                onClick={() => void settle(pick.public_id)}
              >
                {busyId === pick.public_id ? "Liquidando…" : "Liquidar"}
              </button>
            </article>
          ))}
        </div>
      )}

      {message && <div className="control-success">{message}</div>}
      {error && <div className="checkout-error">{error}</div>}

      <p className="control-footnote">
        P&L se calcula en servidor: WIN = stake × (cuota − 1), LOSS = −stake,
        PUSH/VOID = 0. El CLV público usa entrada Bet365 vs cierre Bet365.
      </p>
    </section>
  );
}
