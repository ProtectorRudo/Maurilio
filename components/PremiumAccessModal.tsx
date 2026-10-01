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
};

type AccessStatus = {
  matchday: string;
  pro: boolean;
  elite: boolean;
};

const BASE_PATH = "/maurilio";

export default function PremiumAccessModal({
  tier,
  onClose,
}: {
  tier: Tier;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<CheckoutConfig | null>(null);
  const [access, setAccess] = useState<AccessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
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
    if (!config?.enabled || !price || starting || hasAccess) return;
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

  const elite = tier === "elite";

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={elite ? "access-modal premium-modal elite-modal" : "access-modal premium-modal"} onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        <div className="premium-scanline" aria-hidden="true" />
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
          <button className="primary-button modal-button access-confirmed" disabled>
            Acceso verificado para este Matchday
          </button>
        ) : config?.enabled && price ? (
          <button className="primary-button modal-button" onClick={startCheckout} disabled={starting}>
            {starting ? "Abriendo checkout…" : `Desbloquear · ${formattedPrice}`}
          </button>
        ) : (
          <button className="primary-button modal-button disabled-checkout" disabled>
            Checkout en preparación
          </button>
        )}

        <p className="payment-safety">
          El regreso desde el proveedor de pago no desbloquea el contenido por sí solo. El acceso se concede únicamente tras confirmación del pago en servidor.
        </p>
        {error && <p className="checkout-error">{error}</p>}
      </div>
    </div>
  );
}
