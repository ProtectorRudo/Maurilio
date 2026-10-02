"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./account.module.css";

export default function RecoveryRequestPanel() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(false);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");

    try {
      const response = await fetch("/maurilio/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        setError(true);
        return;
      }

      setSent(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className={styles.panel}>
        <div className={`${styles.message} ${styles.success}`}>
          Si existe una cuenta con ese email, enviamos un enlace para restablecer la contraseña.
        </div>
        <div className={styles.actions}>
          <Link href="/ingresar">Volver a ingresar</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.field}>
          <label htmlFor="recovery-email">Email</label>
          <input
            id="recovery-email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>

        <p className={styles.helper}>
          Por seguridad mostramos el mismo resultado exista o no una cuenta con ese email.
        </p>

        {error ? (
          <div className={`${styles.message} ${styles.error}`}>
            No pudimos iniciar la recuperación en este momento.
          </div>
        ) : null}

        <button className={styles.primary} disabled={busy} type="submit">
          {busy ? "Enviando…" : "Enviar enlace"}
        </button>
      </form>
    </div>
  );
}
