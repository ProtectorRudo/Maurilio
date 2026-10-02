"use client";

import { useEffect, useMemo, useState } from "react";

type State = "success" | "pending" | "failure";
type Tier = "pro" | "elite";
type Verification = "checking" | "verified" | "waiting" | "failed";

type AccessStatus = {
  matchday: string | null;
  pro: boolean;
  elite: boolean;
};

const BASE_PATH = "/maurilio";

const content: Record<State, { kicker: string; title: string; body: string }> = {
  success: {
    kicker: "PAGO INFORMADO",
    title: "Verificación server-side en curso.",
    body: "El regreso desde Mercado Pago no concede acceso. Estamos esperando la confirmación autenticada del servidor.",
  },
  pending: {
    kicker: "PAGO PENDIENTE",
    title: "La operación todavía no terminó.",
    body: "El contenido seguirá cerrado hasta que Mercado Pago confirme la operación y el servidor otorgue el entitlement.",
  },
  failure: {
    kicker: "OPERACIÓN NO COMPLETADA",
    title: "No se desbloqueó ningún contenido.",
    body: "El pago fue cancelado o no pudo completarse. Esta pantalla no modifica ningún acceso.",
  },
};

function readTier(): Tier | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("tier");
  return value === "pro" || value === "elite" ? value : null;
}

export default function PaymentReturn({ state }: { state: State }) {
  const copy = content[state];
  const [tier, setTier] = useState<Tier | null>(null);
  const [verification, setVerification] = useState<Verification>(
    state === "failure" ? "failed" : "checking",
  );

  useEffect(() => {
    const selectedTier = readTier();
    setTier(selectedTier);

    if (state === "failure") return;

    let cancelled = false;
    let attempts = 0;
    let timer: number | null = null;
    const maxAttempts = state === "success" ? 15 : 8;

    async function checkAccess() {
      if (cancelled) return;
      attempts += 1;

      try {
        const response = await fetch(`${BASE_PATH}/api/access`, {
          cache: "no-store",
        });
        if (response.ok) {
          const access = (await response.json()) as AccessStatus;
          const granted = selectedTier
            ? access[selectedTier]
            : access.pro || access.elite;

          if (granted) {
            setVerification("verified");
            return;
          }
        }
      } catch {
        // Keep the content closed and retry within the bounded verification window.
      }

      if (attempts >= maxAttempts) {
        setVerification("waiting");
        return;
      }

      timer = window.setTimeout(checkAccess, 2000);
    }

    void checkAccess();

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [state]);

  const verifiedHref = useMemo(
    () => (tier ? `${BASE_PATH}/?open=${tier}` : BASE_PATH),
    [tier],
  );

  return (
    <main className="payment-return">
      <div className="return-card">
        <a className="brand return-brand" href={BASE_PATH}>
          <span className="brand-mark">M</span>
          <span><b>MAURILIO</b><small>QUANT FOOTBALL</small></span>
        </a>

        <span className={state === "failure" ? "return-kicker failure" : "return-kicker"}>
          {verification === "verified" ? "ACCESS VERIFIED" : copy.kicker}
        </span>

        <h1>
          {verification === "verified"
            ? `${tier?.toUpperCase() ?? "PREMIUM"} desbloqueado.`
            : copy.title}
        </h1>

        <p>
          {verification === "verified"
            ? "El webhook fue validado, la order fue verificada en servidor y el acceso ya está activo para este Matchday."
            : verification === "waiting"
              ? "La confirmación todavía no llegó. El acceso permanece cerrado; podés volver más tarde y el servidor conservará el estado real de la operación."
              : copy.body}
        </p>

        {state !== "failure" && verification !== "verified" && (
          <div className="return-verification" aria-live="polite">
            <span className="verification-pulse" />
            <div>
              <b>{verification === "checking" ? "VERIFYING ORDER" : "AWAITING PROVIDER"}</b>
              <small>
                {verification === "checking"
                  ? "Consultando entitlement verificado…"
                  : "No se habilitó contenido sin confirmación."}
              </small>
            </div>
          </div>
        )}

        <div className="return-security">
          <b>SERVER VERIFIED ACCESS</b>
          <span>La URL de retorno nunca funciona como comprobante de pago.</span>
        </div>

        {verification === "verified" ? (
          <div className="return-actions">
            <a className="primary-button" href={verifiedHref}>
              Revelar {tier?.toUpperCase() ?? "informe"} →
            </a>
            <a className="text-button" href={`${BASE_PATH}/access`}>
              Mis informes
            </a>
          </div>
        ) : (
          <a className="primary-button" href={BASE_PATH}>
            Volver al Matchday
          </a>
        )}
      </div>
    </main>
  );
}
