"use client";

import { useEffect, useState } from "react";
import styles from "./account.module.css";

type Account = {
  role?: string;
  displayName?: string | null;
  tipster?: {
    slug?: string;
    displayName?: string;
    headline?: string | null;
    sports?: string[];
    specialties?: string[];
    monthlyPriceArs?: number | string | null;
    acceptingSubscribers?: boolean;
  } | null;
  error?: string;
};

export default function TipsterProfileForm() {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/maurilio/api/account", { cache: "no-store" });
        if (response.status === 401) {
          setAccount({ error: "authentication_required" });
          return;
        }
        const body = await response.json() as Account;
        setAccount(body);
      } catch {
        setAccount({ error: "unavailable" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const data = new FormData(event.currentTarget);
    const priceText = String(data.get("monthlyPriceArs") || "").trim();
    const payload = {
      slug: String(data.get("slug") || ""),
      displayName: String(data.get("displayName") || ""),
      headline: String(data.get("headline") || ""),
      sports: String(data.get("sports") || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      specialties: String(data.get("specialties") || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      monthlyPriceArs: priceText ? Number(priceText) : null,
      acceptingSubscribers: data.get("acceptingSubscribers") === "on",
    };

    try {
      const response = await fetch("/maurilio/api/tipster/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { error?: string };

      if (response.status === 401) {
        window.location.assign("/maurilio/ingresar?next=%2Fpara-tipsters");
        return;
      }

      if (!response.ok) {
        setMessage({
          kind: "error",
          text:
            body.error === "valid_subscription_price_required"
              ? "Para aceptar suscriptores necesitás definir un precio mensual mayor a cero."
              : "No pudimos guardar el perfil. Revisá el slug, el nombre y el precio.",
        });
        return;
      }

      setMessage({
        kind: "success",
        text: "Perfil guardado. Tu historial público se construirá sólo con tips registrados en Maurilio.",
      });

      const refreshed = await fetch("/maurilio/api/account", { cache: "no-store" });
      if (refreshed.ok) setAccount(await refreshed.json() as Account);
    } catch {
      setMessage({ kind: "error", text: "No pudimos guardar el perfil." });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className={styles.empty}><b>Cargando tu cuenta…</b></div>;
  }

  if (account?.error === "authentication_required") {
    return (
      <div className={styles.empty}>
        <b>Necesitás una cuenta para publicar.</b>
        <a className={styles.primary} style={{ display: "inline-block", marginTop: 14 }} href="/maurilio/ingresar?next=%2Fpara-tipsters">
          Ingresar o crear cuenta
        </a>
      </div>
    );
  }

  if (account?.error) {
    return <div className={styles.empty}><b>No pudimos cargar tu cuenta.</b></div>;
  }

  const tipster = account?.tipster;

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.split}>
        <div className={styles.field}>
          <label htmlFor="tipster-name">Nombre público</label>
          <input
            id="tipster-name"
            name="displayName"
            required
            minLength={2}
            maxLength={60}
            defaultValue={tipster?.displayName ?? account?.displayName ?? ""}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="tipster-slug">URL / slug</label>
          <input
            id="tipster-slug"
            name="slug"
            required
            pattern="[a-z0-9][a-z0-9-]{2,39}"
            placeholder="mi-nombre"
            defaultValue={tipster?.slug ?? ""}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="tipster-headline">Descripción corta</label>
        <textarea
          id="tipster-headline"
          name="headline"
          maxLength={120}
          defaultValue={tipster?.headline ?? ""}
          placeholder="Qué mercados trabajás y cómo pensás tu proceso."
        />
      </div>

      <div className={styles.split}>
        <div className={styles.field}>
          <label htmlFor="tipster-sports">Deportes</label>
          <input
            id="tipster-sports"
            name="sports"
            defaultValue={(tipster?.sports ?? []).join(", ")}
            placeholder="Fútbol, Tenis"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="tipster-specialties">Especialidades</label>
          <input
            id="tipster-specialties"
            name="specialties"
            defaultValue={(tipster?.specialties ?? []).join(", ")}
            placeholder="Goles, Tarjetas, Value"
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="tipster-price">Precio mensual ARS</label>
        <input
          id="tipster-price"
          name="monthlyPriceArs"
          type="number"
          min="0"
          step="1"
          defaultValue={tipster?.monthlyPriceArs == null ? "" : String(tipster.monthlyPriceArs)}
          placeholder="15000"
        />
      </div>

      <label className={styles.check}>
        <input
          type="checkbox"
          name="acceptingSubscribers"
          defaultChecked={Boolean(tipster?.acceptingSubscribers)}
        />
        <span>
          Quiero aceptar nuevas suscripciones. Requiere un precio mensual válido;
          podés apagar esta opción sin borrar tu historial.
        </span>
      </label>

      {message ? (
        <div className={`${styles.message} ${message.kind === "error" ? styles.error : styles.success}`}>
          {message.text}
        </div>
      ) : null}

      <button className={styles.primary} type="submit" disabled={busy}>
        {busy ? "Guardando…" : tipster ? "Guardar cambios" : "Crear perfil tipster"}
      </button>
    </form>
  );
}
