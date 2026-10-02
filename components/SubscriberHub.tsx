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

function hasCurrentAccess(item: Subscription) {
  if (item.status !== "active" || !item.current_period_end) return false;
  const end = new Date(item.current_period_end).getTime();
  return Number.isFinite(end) && end > Date.now();
}

export default function SubscriberHub() {
  const [items, setItems] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/maurilio/api/subscriptions", {
          cache: "no-store",
        });

        if (response.status === 401) {
          window.location.assign("/maurilio/ingresar?next=%2Fsuscripciones");
          return;
        }

        const body = await response.json() as { subscriptions?: Subscription[] };
        setItems(Array.isArray(body.subscriptions) ? body.subscriptions : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className={styles.empty}><b>Cargando suscripciones…</b></div>;
  }

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <b>No tenés accesos todavía.</b>
        Elegí un tipster y comprá 30 días desde su perfil.
        <div className={styles.emptyAction}>
          <Link href="/">Explorar tipsters</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {items.map((item) => {
        const name = item.tipster?.display_name ?? "Tipster";
        const slug = item.tipster?.slug;
        const current = hasCurrentAccess(item);
        const pending = item.status === "pending";

        return (
          <article className={styles.item} key={item.id}>
            <div>
              <span
                className={`${styles.badge} ${
                  current
                    ? styles.active
                    : item.status === "cancelled"
                      ? styles.cancelled
                      : ""
                }`}
              >
                {current
                  ? "Activo"
                  : pending
                    ? "Pago pendiente"
                    : "Vencido"}
              </span>

              <h3>
                {slug ? <Link href={`/tipsters/${slug}`}>{name}</Link> : name}
              </h3>

              <p>
                {money(item.monthly_price_ars)} · 30 días
                {item.current_period_end
                  ? ` · acceso hasta ${date(item.current_period_end)}`
                  : ""}
              </p>
            </div>

            {current ? (
              <span className={styles.manualRenewal}>Sin débito automático</span>
            ) : slug && !pending ? (
              <Link className={styles.secondary} href={`/tipsters/${slug}`}>
                Renovar
              </Link>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
