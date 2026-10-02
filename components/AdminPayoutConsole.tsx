"use client";

import { useEffect, useState } from "react";
import styles from "./account.module.css";

type Payout = {
  id: string;
  tipsterId: string;
  tipsterSlug: string;
  tipsterName: string;
  amountArs: number | string;
  status: "pending" | "paid" | "cancelled";
  providerReference?: string | null;
  createdAt?: string;
  paidAt?: string | null;
};

function money(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export default function AdminPayoutConsole() {
  const [items, setItems] = useState<Payout[]>([]);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/maurilio/api/admin/payouts", {
        cache: "no-store",
      });

      if (response.status === 401) {
        window.location.assign("/maurilio/ingresar?next=%2Fadmin");
        return;
      }

      if (!response.ok) {
        setError("No pudimos cargar la cola de pagos.");
        return;
      }

      const body = await response.json() as Payout[] | { data?: Payout[] };
      setItems(
        Array.isArray(body)
          ? body
          : Array.isArray(body.data)
            ? body.data
            : [],
      );
    } catch {
      setError("No pudimos cargar la cola de pagos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function settle(payout: Payout, status: "paid" | "cancelled") {
    const reference = (refs[payout.id] ?? "").trim();
    if (status === "paid" && !reference) {
      setError("Ingresá una referencia antes de marcar el pago como realizado.");
      return;
    }

    setWorking(payout.id);
    setError(null);

    try {
      const response = await fetch("/maurilio/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutId: payout.id,
          status,
          providerReference: status === "paid" ? reference : null,
        }),
      });

      if (!response.ok) {
        setError("No pudimos actualizar el payout.");
        return;
      }

      await load();
    } catch {
      setError("No pudimos actualizar el payout.");
    } finally {
      setWorking(null);
    }
  }

  if (loading) {
    return <div className={styles.empty}><b>Cargando pagos…</b></div>;
  }

  if (error) {
    return <div className={`${styles.message} ${styles.error}`}>{error}</div>;
  }

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <b>No hay solicitudes de cobro todavía.</b>
        Los payouts aparecerán acá cuando un tipster solicite retirar su saldo.
      </div>
    );
  }

  return (
    <div className={styles.payoutList}>
      {items.map((payout) => (
        <article className={styles.payoutCard} key={payout.id}>
          <div>
            <div className={styles.adminBadges}>
              <span
                className={`${styles.badge} ${
                  payout.status === "paid"
                    ? styles.active
                    : payout.status === "cancelled"
                      ? styles.cancelled
                      : ""
                }`}
              >
                {payout.status}
              </span>
            </div>
            <h3>{payout.tipsterName}</h3>
            <p>
              @{payout.tipsterSlug} · solicitado {dateTime(payout.createdAt)}
            </p>
          </div>

          <div className={styles.payoutAmount}>{money(payout.amountArs)}</div>

          {payout.status === "pending" ? (
            <div className={styles.payoutActions}>
              <input
                value={refs[payout.id] ?? ""}
                onChange={(event) =>
                  setRefs((current) => ({
                    ...current,
                    [payout.id]: event.target.value,
                  }))
                }
                placeholder="Referencia de transferencia"
                maxLength={180}
              />
              <button
                className={styles.primary}
                type="button"
                disabled={working === payout.id}
                onClick={() => void settle(payout, "paid")}
              >
                Marcar pagado
              </button>
              <button
                className={styles.danger}
                type="button"
                disabled={working === payout.id}
                onClick={() => {
                  if (window.confirm("Cancelar esta solicitud de cobro?")) {
                    void settle(payout, "cancelled");
                  }
                }}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className={styles.payoutReference}>
              <small>Referencia</small>
              <b>{payout.providerReference || "—"}</b>
              {payout.paidAt ? <span>Pagado {dateTime(payout.paidAt)}</span> : null}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
