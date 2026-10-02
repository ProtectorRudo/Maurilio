"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./account.module.css";

type State = "loading" | "ready" | "invalid";

export default function PasswordResetPanel() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token") || "";
      const refreshToken = hash.get("refresh_token") || "";
      const expiresIn = Number(hash.get("expires_in"));

      if (!accessToken || !refreshToken) {
        setState("invalid");
        return;
      }

      try {
        const response = await fetch("/maurilio/api/auth/recovery-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken,
            refreshToken,
            expiresIn: Number.isFinite(expiresIn) ? expiresIn : undefined,
          }),
        });

        if (!response.ok) {
          setState("invalid");
          return;
        }

        window.history.replaceState({}, "", window.location.pathname);
        setState("ready");
      } catch {
        setState("invalid");
      }
    })();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("confirmation") || "");

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      setBusy(false);
      return;
    }

    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch("/maurilio/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setError("No pudimos actualizar la contraseña. Pedí un nuevo enlace.");
        return;
      }

      window.location.assign("/maurilio/ingresar?reset=1");
    } catch {
      setError("No pudimos actualizar la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return <div className={styles.empty}><b>Validando enlace…</b></div>;
  }

  if (state === "invalid") {
    return (
      <div className={styles.panel}>
        <div className={`${styles.message} ${styles.error}`}>
          El enlace de recuperación no es válido o ya venció.
        </div>
        <div className={styles.actions}>
          <Link href="/recuperar">Solicitar otro enlace</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.field}>
          <label htmlFor="new-password">Nueva contraseña</label>
          <input
            id="new-password"
            name="password"
            type="password"
            minLength={8}
            maxLength={200}
            autoComplete="new-password"
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="new-password-confirm">Repetir contraseña</label>
          <input
            id="new-password-confirm"
            name="confirmation"
            type="password"
            minLength={8}
            maxLength={200}
            autoComplete="new-password"
            required
          />
        </div>

        {error ? (
          <div className={`${styles.message} ${styles.error}`}>{error}</div>
        ) : null}

        <button className={styles.primary} disabled={busy} type="submit">
          {busy ? "Actualizando…" : "Cambiar contraseña"}
        </button>
      </form>
    </div>
  );
}
