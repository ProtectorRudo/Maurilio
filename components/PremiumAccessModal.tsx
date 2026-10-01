"use client";

import { useEffect, useMemo, useState } from "react";

type Tier = "pro" | "elite";

type CheckoutConfig = {
  enabled: boolean;
  provider: "mercado_pago";
  prices: {
    pro: number | null;
    elite: number | null;
  };
  availability: {
    pro: boolean;
    elite: boolean;
  };
};

type AccessStatus = {
  matchday: string;
  pro: boolean;
  elite: boolean;
};

type PremiumReport = {
  id: string;
  matchday: string;
  tier: Tier;
  competition: string;
  event: string;
  market: string;
  selection: string | null;
  bookmaker: "Bet365";
  odds: number | null;
  minimumOdds: number | null;
  probability: number | null;
  probabilityRange: { low: number; high: number } | null;
  impliedProbability: number | null;
  edge: number | null;
  ev: number | null;
  stake: number | null;
  thesis: string | null;
  risk: string | null;
  capturedAt: string | null;
};

const BASE_PATH = "/maurilio";

function percent(value: number | null, digits = 1) {
  if (value === null) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export default function PremiumAccessModal({
  tier,
  onClose,
}: {
  tier: Tier;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<CheckoutConfig | null>(null);
  const [access, setAccess] = useState<AccessStatus | null>(null);
  const [report, setReport] = useState<PremiumReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      fetch(`${BASE_PATH}/api/checkout`, {
        signal: controller.signal,
        cache: "no-store",
      }).then(async (response) => {
        if (!response.ok) throw new Error("checkout_config");
        return (await response.json()) as CheckoutConfig;
      }),
      fetch(`${BASE_PATH}/api/access`, {
        signal: controller.signal,
        cache: "no-store",
      }).then(async (response) => {
        if (!response.ok) throw new Error("access_status");
        return (await response.json()) as AccessStatus;
      }),
    ])
      .then(([checkoutConfig, accessStatus]) => {
        setConfig(checkoutConfig);
        setAccess(accessStatus);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("No pudimos consultar el estado de acceso.");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const price = config?.prices[tier] ?? null;
  const available = Boolean(config?.availability?.[tier]);
  const hasAccess = Boolean(access?.[tier]);

  const formattedPrice = useMemo(() => {
    if (!price) return null;
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(price);
  }, [price]);

  async function startCheckout() {
    if (!config?.enabled || !price || !available || starting || hasAccess) return;
    setStarting(true);
    setError(null);

    try {
      const response = await fetch(`${BASE_PATH}/api/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = (await response.json()) as {
        checkoutUrl?: string;
        error?: string;
      };

      if (!response.ok || !data.checkoutUrl) {
        throw new Error(data.error || "checkout_start");
      }

      window.location.assign(data.checkoutUrl);
    } catch {
      setError("No pudimos iniciar el pago. No se realizó ningún cargo.");
      setStarting(false);
    }
  }

  async function revealReport() {
    if (!hasAccess || revealing || report) return;
    setRevealing(true);
    setError(null);

    try {
      const response = await fetch(`${BASE_PATH}/api/premium/${tier}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as PremiumReport & { error?: string };

      if (!response.ok) {
        if (data.error === "report_not_published") {
          throw new Error("report_not_published");
        }
        throw new Error("premium_report");
      }

      await new Promise((resolve) => window.setTimeout(resolve, 850));
      setReport(data);
    } catch (err) {
      setError(
        err instanceof Error && err.message === "report_not_published"
          ? "El informe todavía no fue publicado. Tu acceso sigue registrado."
          : "No pudimos abrir el informe verificado.",
      );
    } finally {
      setRevealing(false);
    }
  }

  const elite = tier === "elite";

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className={
          elite
            ? "access-modal premium-modal elite-modal"
            : "access-modal premium-modal"
        }
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
        <div className="premium-scanline" aria-hidden="true" />

        {report ? (
          <div className="premium-report reveal-enter">
            <div className="premium-report-head">
              <span>{elite ? "THE LOCKER" : "VAR AUDIT"}</span>
              <b>ACCESS VERIFIED</b>
            </div>
            <small>{report.competition}</small>
            <h3>{report.event}</h3>

            <div className="premium-selection">
              <span>MERCADO</span>
              <b>{report.market}</b>
              {report.selection && <strong>{report.selection}</strong>}
            </div>

            <div className="premium-report-metrics">
              <div><small>BET365</small><b>{report.odds ? `@${report.odds.toFixed(2)}` : "—"}</b></div>
              <div><small>CUOTA MÍN.</small><b>{report.minimumOdds?.toFixed(2) ?? "—"}</b></div>
              <div><small>MODELO</small><b>{percent(report.probability)}</b></div>
              <div><small>EDGE</small><b>{report.edge === null ? "—" : `+${percent(report.edge)}`}</b></div>
              <div><small>EV</small><b>{report.ev === null ? "—" : `+${percent(report.ev)}`}</b></div>
              <div><small>STAKE</small><b>{percent(report.stake, 2)}</b></div>
            </div>

            {report.probabilityRange && (
              <div className="premium-range">
                RANGO MODELO · {percent(report.probabilityRange.low)} — {percent(report.probabilityRange.high)}
              </div>
            )}

            <div className="premium-thesis">
              <span>TESIS</span>
              <p>{report.thesis || "Sin tesis publicada."}</p>
            </div>
            <div className="premium-risk">
              <span>MEJOR RAZÓN PARA NO ENTRAR</span>
              <p>{report.risk || "Sin riesgo principal publicado."}</p>
            </div>

            <div className="premium-proof">
              <span>ID {report.id}</span>
              <span>{report.capturedAt ? `CUOTA CAPTURADA · ${report.capturedAt}` : "CAPTURA PENDIENTE"}</span>
            </div>
          </div>
        ) : (
          <>
            <span className="modal-icon">{elite ? "M+" : "M"}</span>
            <small>{elite ? "THE LOCKER" : "VAR AUDIT"}</small>
            <h3>{elite ? "High Conviction" : "Acceso PRO"}</h3>
            <p className="premium-intro">
              {elite
                ? "El informe de máxima convicción: tesis, precio mínimo, rango de probabilidad y principal riesgo."
                : "El análisis completo: tesis, precio mínimo, rango de probabilidad, edge, EV y auditoría adversarial."}
            </p>

            <div className="premium-detail-grid">
              <div><span>ENTREGA</span><b>Matchday actual</b></div>
              <div><span>STAKE</span><b>{elite ? "hasta 2%" : "hasta 1.5%"}</b></div>
              <div><span>ACCESO</span><b>{loading ? "Verificando…" : hasAccess ? "VERIFICADO" : "Digital"}</b></div>
              <div><span>PRECIO</span><b>{loading ? "Consultando…" : hasAccess ? "YA ADQUIRIDO" : formattedPrice || "Por definir"}</b></div>
            </div>

            {hasAccess ? (
              <button
                className="primary-button modal-button access-confirmed"
                onClick={revealReport}
                disabled={revealing}
              >
                {revealing ? "VAR REVIEW…" : "Revelar informe verificado"}
              </button>
            ) : available && config?.enabled && price ? (
              <button
                className="primary-button modal-button"
                onClick={startCheckout}
                disabled={starting}
              >
                {starting ? "Abriendo checkout…" : `Desbloquear · ${formattedPrice}`}
              </button>
            ) : available ? (
              <button className="primary-button modal-button disabled-checkout" disabled>
                Checkout en preparación
              </button>
            ) : (
              <div className="no-premium-signal">
                <b>NO HAY INFORME {elite ? "HIGH CONVICTION" : "PRO"} PUBLICADO</b>
                <span>Si el modelo no encuentra valor suficiente, este nivel no se vende.</span>
              </div>
            )}

            <p className="payment-safety">
              El regreso desde el proveedor de pago no desbloquea el contenido por sí solo. El acceso se concede únicamente tras confirmación del pago en servidor.
            </p>
            {error && <p className="checkout-error">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
