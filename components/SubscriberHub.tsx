"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./account.module.css";

type Subscription = {
  id: string;
  status: string;
  monthly_price_ars?: number | string | null;
  current_period_end?: string | null;
  created_at?: string;
  tipster?: {
    slug?: string;
    display_name?: string;
    headline?: string | null;
  } | null;
};

function money(value: number | string | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(parsed);
}

function date(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(parsed);
}

export default function SubscriberHub() {
  const [items, setItems] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/maurilio/api/subscriptions", { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign("/maurilio/ingresar?next=%2Fsuscripciones");
        return;
      }
      const body = await response.json() as { subscriptions?: Subscription[] };
      setItems(Array.isArray(body.subscriptions) ? body.subscriptions : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function cancel(id: string) {
    setWorking(id);
    setMessage(null);
    try {
      const response = await fetch("/maurilio/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", subscriptionId: id }),
      });
      const body = await response.json() as {
        error?: string;
        accessUntil?: string | null;
      };

      if (!response.ok) {
        setMessage("No pudimos cancelar la renovación.");
        return;
      }

      setMessage(
        body.accessUntil
          ? `Renovación cancelada. El acceso continúa hasta ${date(body.accessUntil)}.`
          : "Renovación cancelada.",
      );
      await load();
    } catch {
      setMessage("No pudimos cancelar la renovación.");
    } finally {
      setWorking(null);
    }
  }

  if (loading) {
    return <div className={styles.empty}><b>Cargando suscripciones…</b></div>;
  }

  return (
    <>
      {message ? <div className={`${styles.message} ${styles.success}`}>{message}</div> : null}

      {items.length === 0 ? (
        <div className={styles.empty}>
          <b>No tenés suscripciones todavía.</b>
          Explorá tipsters y elegí por historial, no por promesas.
        </div>
      ) : (
        <div className={styles.list}>
          {items.map((item) => {
            const name = item.tipster?.display_name ?? "Tipster";
            const slug = item.tipster?.slug;
            const canCancel = ["active", "pending", "past_due", "paused"].includes(item.status);

            return (
              <article className={styles.item} key={item.id}>
                <div>
                  <span className={`${styles.badge} ${item.status === "active" ? styles.active : item.status === "cancelled" ? styles.cancelled : ""}`}>
                    {item.status}
                  </span>
                  <h3>{slug ? <Link href={`/tipsters/${slug}`}>{name}</Link> : name}</h3>
                  <p>
                    {money(item.monthly_price_ars)} / mes
                    {item.current_period_end ? ` · acceso hasta ${date(item.current_period_end)}` : ""}
                  </p>
                </div>

                {canCancel ? (
                  <button
                    className={styles.secondary}
                    type="button"
                    disabled={working === item.id}
                    onClick={() => void cancel(item.id)}
                  >
                    {working === item.id ? "Cancelando…" : "Cancelar renovación"}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
