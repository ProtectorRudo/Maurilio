"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./account.module.css";

type Mode = "login" | "signup";

export default function AuthPanel({ nextPath }: { nextPath: string }) {
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
      displayName: String(form.get("displayName") || ""),
    };

    try {
      const response = await fetch(
        mode === "login" ? "/maurilio/api/auth/login" : "/maurilio/api/auth/signup",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await response.json() as { error?: string; confirmationRequired?: boolean };

      if (!response.ok) {
        setMessage({
          kind: "error",
          text:
            mode === "login"
              ? "No pudimos iniciar sesión con esos datos."
              : "No pudimos crear la cuenta. Revisá el email y la contraseña.",
        });
        return;
      }

      if (body.confirmationRequired) {
        setMessage({
          kind: "success",
          text: "Cuenta creada. Revisá tu email para confirmar el acceso y después ingresá.",
        });
        setMode("login");
        return;
      }

      window.location.assign(`/maurilio${nextPath === "/" ? "" : nextPath}`);
    } catch {
      setMessage({ kind: "error", text: "El acceso no está disponible en este momento." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${mode === "login" ? styles.tabActive : ""}`}
          type="button"
          onClick={() => { setMode("login"); setMessage(null); }}
        >
          Ingresar
        </button>
        <button
          className={`${styles.tab} ${mode === "signup" ? styles.tabActive : ""}`}
          type="button"
          onClick={() => { setMode("signup"); setMessage(null); }}
        >
          Crear cuenta
        </button>
      </div>

      <form className={styles.form} onSubmit={submit}>
        {mode === "signup" ? (
          <div className={styles.field}>
            <label htmlFor="displayName">Nombre</label>
            <input id="displayName" name="displayName" maxLength={60} autoComplete="name" />
          </div>
        ) : null}

        <div className={styles.field}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
        </div>

        <div className={styles.field}>
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            minLength={8}
            required
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </div>

        <p className={styles.helper}>
          Tu sesión se guarda en una cookie HTTP-only. La contraseña no se almacena en Maurilio.
        </p>

        {mode === "login" ? (
          <p className={styles.helper}>
            <Link href="/recuperar">Olvidé mi contraseña</Link>
          </p>
        ) : null}

        {message ? (
          <div className={`${styles.message} ${message.kind === "error" ? styles.error : styles.success}`}>
            {message.text}
          </div>
        ) : null}

        <button className={styles.primary} disabled={busy} type="submit">
          {busy ? "Procesando…" : mode === "login" ? "Ingresar" : "Crear cuenta"}
        </button>
      </form>
    </div>
  );
}
