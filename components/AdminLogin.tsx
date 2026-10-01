"use client";

import { FormEvent, useState } from "react";

const BASE_PATH = "/maurilio";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BASE_PATH}/api/admin/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        throw new Error("login_failed");
      }

      window.location.reload();
    } catch {
      setError("Acceso rechazado.");
      setLoading(false);
    }
  }

  return (
    <section className="admin-login-shell">
      <div className="admin-login-card">
        <span className="brand-mark admin-login-mark">M</span>
        <small>MAURILIO / CONTROL ROOM</small>
        <h1>Acceso operativo</h1>
        <p>
          Este panel modifica publicaciones y datos de producción. El acceso
          expira automáticamente.
        </p>
        <form onSubmit={submit}>
          <label>
            Clave administrativa
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={24}
            />
          </label>
          <button className="primary-button" disabled={loading}>
            {loading ? "Verificando…" : "Entrar al Control Room"}
          </button>
        </form>
        {error && <div className="checkout-error">{error}</div>}
      </div>
    </section>
  );
}
