"use client";

import { FormEvent, useState } from "react";

const BASE_PATH = "/maurilio";

function dateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return (
    new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date) + " ART"
  );
}

export default function AccessRecovery({
  hasAccess,
}: {
  hasAccess: boolean;
}) {
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"issue" | "redeem" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function issue() {
    if (busy) return;
    setBusy("issue");
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        `${BASE_PATH}/api/access/recovery/issue`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );
      const data = (await response.json()) as {
        code?: string;
        expiresAt?: string;
        error?: string;
      };
      if (!response.ok || !data.code) {
        throw new Error(data.error || "issue_failed");
      }
      setIssuedCode(data.code);
      setExpiresAt(data.expiresAt ?? null);
      setMessage(
        "Código creado. Guardalo ahora: al generar otro, éste deja de ser válido.",
      );
    } catch {
      setError("No pudimos generar un código de recuperación.");
    } finally {
      setBusy(null);
    }
  }

  async function copyCode() {
    if (!issuedCode) return;
    try {
      await navigator.clipboard.writeText(issuedCode);
      setMessage("Código copiado.");
    } catch {
      setMessage("Seleccioná y copiá el código manualmente.");
    }
  }

  async function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !code.trim()) return;

    setBusy("redeem");
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        `${BASE_PATH}/api/access/recovery/redeem`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        },
      );
      const data = (await response.json()) as {
        ok?: boolean;
        activeEntitlements?: number;
        error?: string;
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "redeem_failed");
      }

      setMessage(
        `Acceso recuperado · ${data.activeEntitlements ?? 0} informe(s) activo(s).`,
      );
      setCode("");
      window.location.reload();
    } catch {
      setError("El código es inválido, venció o ya fue utilizado.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="recovery-panel">
      <div className="recovery-head">
        <div>
          <span className="section-kicker">ACCESS RECOVERY</span>
          <h2>Recuperar en otro dispositivo</h2>
        </div>
        <span className="recovery-security">SINGLE USE</span>
      </div>

      <p className="recovery-intro">
        El acceso vive en una cookie privada del navegador. Para moverlo sin
        cuentas ni email, Maurilio usa un código de recuperación de un solo uso.
        Nunca se incluye en URLs.
      </p>

      <div className="recovery-grid">
        <article className="recovery-card">
          <small>DISPOSITIVO CON ACCESO</small>
          <h3>Crear Recovery Code</h3>
          <p>
            Válido por 7 días. Generar uno nuevo invalida cualquier código
            anterior. Tus informes siguen funcionando en este dispositivo.
          </p>

          {issuedCode ? (
            <div className="recovery-code-box">
              <span>GUARDAR AHORA</span>
              <code>{issuedCode}</code>
              <small>Vence {dateTime(expiresAt)}</small>
              <button
                type="button"
                className="text-button"
                onClick={() => void copyCode()}
              >
                Copiar código
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="primary-button"
              disabled={!hasAccess || busy === "issue"}
              onClick={() => void issue()}
            >
              {busy === "issue"
                ? "Generando…"
                : hasAccess
                  ? "Generar código"
                  : "Requiere acceso activo"}
            </button>
          )}
        </article>

        <article className="recovery-card">
          <small>NUEVO DISPOSITIVO</small>
          <h3>Ingresar Recovery Code</h3>
          <p>
            El código se consume al recuperar el acceso. No lo compartas y no lo
            publiques en capturas o mensajes abiertos.
          </p>
          <form className="recovery-form" onSubmit={redeem}>
            <label>
              Recovery Code
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="MB-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
              />
            </label>
            <button
              type="submit"
              className="primary-button"
              disabled={!code.trim() || busy === "redeem"}
            >
              {busy === "redeem" ? "Verificando…" : "Recuperar acceso"}
            </button>
          </form>
        </article>
      </div>

      {message && <div className="control-success">{message}</div>}
      {error && <div className="checkout-error">{error}</div>}

      <p className="control-footnote">
        Maurilio almacena sólo el hash del Recovery Code. El código en claro se
        muestra únicamente en este navegador al generarlo.
      </p>
    </section>
  );
}
