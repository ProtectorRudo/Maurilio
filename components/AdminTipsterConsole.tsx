"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./account.module.css";

type Tipster = {
  id: string;
  slug: string;
  displayName: string;
  headline?: string | null;
  sports?: string[];
  specialties?: string[];
  monthlyPriceArs?: number | string | null;
  currency?: string;
  verified?: boolean;
  acceptingSubscribers?: boolean;
  status?: "draft" | "published" | "suspended";
  picksCount90d?: number;
  roiPct90d?: number | string | null;
  winRatePct90d?: number | string | null;
  avgClvPct90d?: number | string | null;
  createdAt?: string;
};

function pct(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function money(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function AdminTipsterConsole() {
  const [items, setItems] = useState<Tipster[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/maurilio/api/admin/tipsters", {
        cache: "no-store",
      });

      if (response.status === 401) {
        window.location.assign("/maurilio/ingresar?next=%2Fadmin");
        return;
      }

      if (response.status === 403 || response.status === 400 || response.status === 500) {
        const body = await response.json().catch(() => ({})) as { message?: string; error?: string };
        if (
          body.message?.includes("admin_required") ||
          body.error?.includes("admin_required")
        ) {
          setForbidden(true);
          return;
        }
      }

      if (!response.ok) {
        setError("No pudimos cargar la moderación.");
        return;
      }

      const body = await response.json() as Tipster[] | { data?: Tipster[] };
      const list = Array.isArray(body)
        ? body
        : Array.isArray(body.data)
          ? body.data
          : [];
      setItems(list);
    } catch {
      setError("No pudimos cargar la moderación.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function update(
    tipsterId: string,
    patch: { status?: Tipster["status"]; verified?: boolean },
  ) {
    setWorking(tipsterId);
    setError(null);

    try {
      const response = await fetch("/maurilio/api/admin/tipsters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipsterId, ...patch }),
      });

      if (!response.ok) {
        setError("No pudimos aplicar el cambio.");
        return;
      }

      await load();
    } catch {
      setError("No pudimos aplicar el cambio.");
    } finally {
      setWorking(null);
    }
  }

  if (loading) {
    return <div className={styles.empty}><b>Cargando moderación…</b></div>;
  }

  if (forbidden) {
    return (
      <div className={styles.empty}>
        <b>Esta sección requiere rol administrador.</b>
        <Link href="/cuenta">Volver a mi cuenta</Link>
      </div>
    );
  }

  if (error) {
    return <div className={`${styles.message} ${styles.error}`}>{error}</div>;
  }

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <b>No hay tipsters con cuenta propietaria todavía.</b>
        La consola se poblará cuando aparezcan los primeros perfiles reales.
      </div>
    );
  }

  return (
    <div className={styles.adminList}>
      {items.map((tipster) => (
        <article className={styles.adminCard} key={tipster.id}>
          <div className={styles.adminCardTop}>
            <div>
              <div className={styles.adminBadges}>
                <span className={styles.badge}>{tipster.status ?? "draft"}</span>
                {tipster.verified ? (
                  <span className={`${styles.badge} ${styles.active}`}>verificado</span>
                ) : (
                  <span className={styles.badge}>sin verificar</span>
                )}
                {tipster.acceptingSubscribers ? (
                  <span className={`${styles.badge} ${styles.active}`}>vendiendo</span>
                ) : null}
              </div>
              <h3>{tipster.displayName}</h3>
              <p>
                @{tipster.slug}
                {tipster.headline ? ` · ${tipster.headline}` : ""}
              </p>
            </div>
            <Link href={`/tipsters/${tipster.slug}`}>Ver perfil</Link>
          </div>

          <div className={styles.adminMetrics}>
            <div><small>Tips 90d</small><b>{tipster.picksCount90d ?? 0}</b></div>
            <div><small>ROI</small><b>{pct(tipster.roiPct90d)}</b></div>
            <div><small>Win rate</small><b>{pct(tipster.winRatePct90d)}</b></div>
            <div><small>CLV</small><b>{pct(tipster.avgClvPct90d)}</b></div>
            <div><small>Precio</small><b>{money(tipster.monthlyPriceArs)}</b></div>
          </div>

          <div className={styles.actions}>
            <button
              className={styles.secondary}
              type="button"
              disabled={working === tipster.id}
              onClick={() => void update(tipster.id, { verified: !tipster.verified })}
            >
              {tipster.verified ? "Quitar verificación" : "Verificar"}
            </button>

            {tipster.status === "suspended" ? (
              <button
                className={styles.secondary}
                type="button"
                disabled={working === tipster.id}
                onClick={() => void update(tipster.id, { status: "published" })}
              >
                Reactivar
              </button>
            ) : (
              <button
                className={styles.danger}
                type="button"
                disabled={working === tipster.id}
                onClick={() => {
                  if (window.confirm("Suspender este tipster y cerrar nuevas suscripciones?")) {
                    void update(tipster.id, { status: "suspended" });
                  }
                }}
              >
                Suspender
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
