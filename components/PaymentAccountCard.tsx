"use client";

import { useEffect, useState } from "react";
import styles from "./account.module.css";

type Status = {
  configured?: boolean;
  connected?: boolean;
  providerUserId?: string | null;
  liveMode?: boolean;
  tokenExpiresAt?: string | null;
};

export default function PaymentAccountCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/maurilio/api/tipster/payment-account", {
      cache: "no-store",
    });

    if (response.status === 401) {
      window.location.assign("/maurilio/ingresar?next=%2Fpanel-tipster");
      return;
    }

    if (!response.ok) {
      setStatus({ configured: false, connected: false });
      return;
    }

    setStatus(await response.json() as Status);
  }

  useEffect(() => {
    void load();
  }, []);

  async function connect() {
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/maurilio/api/tipster/payment-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });

      const body = await response.json() as {
        authorizationUrl?: string;
        error?: string;
      };

      if (!response.ok || !body.authorizationUrl) {
        setMessage(
          body.error === "marketplace_payments_not_configured"
            ? "La conexión de Mercado Pago todavía no está habilitada."
            : "No pudimos iniciar la conexión.",
        );
        return;
      }

      if (!/^https:\/\/auth\.mercadopago\.com\.ar\//i.test(body.authorizationUrl)) {
        setMessage("La URL de autorización recibida no es válida.");
        return;
      }

      window.location.assign(body.authorizationUrl);
    } catch {
      setMessage("No pudimos iniciar la conexión.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Desconectar Mercado Pago de tu perfil?")) return;

    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/maurilio/api/tipster/payment-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });

      if (!response.ok) {
        setMessage("No pudimos desconectar Mercado Pago.");
        return;
      }

      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return <div className={styles.paymentConnect}><b>Cargando cobros…</b></div>;
  }

  const expiry = status.tokenExpiresAt
    ? new Date(status.tokenExpiresAt).getTime()
    : NaN;
  const needsRenewal =
    status.connected &&
    Number.isFinite(expiry) &&
    expiry < Date.now() + 30 * 24 * 60 * 60 * 1000;

  return (
    <section className={styles.paymentConnect}>
      <div>
        <span className={styles.paymentEyebrow}>Cobros</span>
        <h3>Mercado Pago</h3>
        <p>
          {status.connected
            ? needsRenewal
              ? "Tu cuenta está conectada, pero conviene renovar la autorización para no interrumpir futuros cobros."
              : "Los pagos de tus suscriptores irán a tu cuenta. Maurilio recibe únicamente su comisión."
            : status.configured === false
              ? "La conexión todavía no está habilitada por Maurilio."
              : "Conectá tu cuenta para poder recibir suscripciones directamente."}
        </p>
      </div>

      {status.connected ? (
        <div className={styles.paymentConnectActions}>
          <span className={styles.connectedBadge}>
            {needsRenewal ? "Autorización por vencer" : "✓ Conectado"}
          </span>
          {needsRenewal ? (
            <button type="button" onClick={() => void connect()} disabled={busy}>
              {busy ? "Abriendo…" : "Renovar autorización"}
            </button>
          ) : null}
          <button type="button" onClick={() => void disconnect()} disabled={busy}>
            Desconectar
          </button>
        </div>
      ) : (
        <button
          className={styles.primary}
          type="button"
          onClick={() => void connect()}
          disabled={busy || status.configured === false}
        >
          {busy ? "Abriendo…" : "Conectar Mercado Pago"}
        </button>
      )}

      {message ? <div className={styles.message}>{message}</div> : null}
    </section>
  );
}
