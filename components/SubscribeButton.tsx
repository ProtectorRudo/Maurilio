"use client";

import { useState } from "react";
import styles from "./marketplace.module.css";

export default function SubscribeButton({
  slug,
  returnPath,
}: {
  slug: string;
  returnPath: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subscribe() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/maurilio/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", tipsterSlug: slug }),
      });

      const body = await response.json() as {
        error?: string;
        checkoutUrl?: string;
      };

      if (response.status === 401) {
        window.location.assign(
          `/maurilio/ingresar?next=${encodeURIComponent(returnPath)}`,
        );
        return;
      }

      if (!response.ok || !body.checkoutUrl) {
        const copy =
          body.error === "subscription_already_exists"
            ? "Ya existe una suscripción para este tipster."
            : body.error === "subscriptions_disabled"
              ? "Las suscripciones todavía no están habilitadas."
              : "No pudimos iniciar la suscripción.";
        setError(copy);
        return;
      }

      if (!/^https:\/\//i.test(body.checkoutUrl)) {
        setError("El checkout recibido no es válido.");
        return;
      }

      window.location.assign(body.checkoutUrl);
    } catch {
      setError("No pudimos conectar con el checkout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className={styles.cta} type="button" disabled={busy} onClick={subscribe}>
        {busy ? "Abriendo checkout…" : "Suscribirme"}
      </button>
      {error ? (
        <p style={{ color: "#ff9d8c", fontSize: 11, lineHeight: 1.5 }}>{error}</p>
      ) : null}
    </>
  );
}
