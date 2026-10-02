"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PaymentAccountCard from "@/components/PaymentAccountCard";
import styles from "./account.module.css";

type Dashboard = {
  activeSubscribers?: number;
  balanceArs?: number | string;
  tipsterNetArs?: number | string;
  pendingPayoutArs?: number | string;
  activePromotionEndsAt?: string | null;
  error?: string;
};

type PromotionStatus = {
  configured?: boolean;
  dailyPriceArs?: number | string | null;
  allowedDays?: number[];
};

function money(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(parsed);
}

function date(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(parsed);
}

export default function TipsterDashboard() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [promotion, setPromotion] = useState<PromotionStatus | null>(null);
  const [busyDays, setBusyDays] = useState<number | null>(null);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadDashboard() {
    const response = await fetch("/maurilio/api/tipster/dashboard", {
      cache: "no-store",
    });

    if (response.status === 401) {
      window.location.assign("/maurilio/ingresar?next=%2Fpanel-tipster");
      return;
    }

    const data = await response.json() as Dashboard;
    if (!response.ok) {
      setDashboard({ error: "profile_required" });
      return;
    }

    setDashboard(data);

    const promoResponse = await fetch("/maurilio/api/promotions", {
      cache: "no-store",
    });
    if (promoResponse.ok) {
      setPromotion(await promoResponse.json() as PromotionStatus);
    }
  }

  useEffect(() => {
    void loadDashboard().catch(() => setDashboard({ error: "unavailable" }));
  }, []);

  async function requestPayout() {
    if (!dashboard) return;

    setPayoutBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/maurilio/api/tipster/payout", {
        method: "POST",
      });
      const body = await response.json() as {
        error?: string;
        amountArs?: number | string;
      };

      if (!response.ok) {
        setMessage(
          body.error?.includes("payout_already_pending")
            ? "Ya tenés un cobro pendiente."
            : body.error?.includes("no_payout_balance")
              ? "No hay saldo disponible para cobrar."
              : "No pudimos solicitar el cobro.",
        );
        return;
      }

      setMessage(`Cobro solicitado por ${money(body.amountArs)}.`);
      await loadDashboard();
    } catch {
      setMessage("No pudimos solicitar el cobro.");
    } finally {
      setPayoutBusy(false);
    }
  }

  async function buyPromotion(days: number) {
    setBusyDays(days);
    setMessage(null);

    try {
      const response = await fetch("/maurilio/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const body = await response.json() as {
        checkoutUrl?: string;
        error?: string;
      };

      if (!response.ok || !body.checkoutUrl || !/^https:\/\//i.test(body.checkoutUrl)) {
        setMessage("La promoción no está disponible ahora.");
        return;
      }

      window.location.assign(body.checkoutUrl);
    } catch {
      setMessage("La promoción no está disponible ahora.");
    } finally {
      setBusyDays(null);
    }
  }

  if (!dashboard) {
    return <div className={styles.empty}><b>Cargando panel…</b></div>;
  }

  if (dashboard.error) {
    return (
      <div className={styles.empty}>
        <b>Primero creá tu perfil tipster.</b>
        <Link href="/para-tipsters">Crear perfil</Link>
      </div>
    );
  }

  const pending = Number(dashboard.pendingPayoutArs ?? 0);
  const balance = Number(dashboard.balanceArs ?? 0);

  return (
    <>
      <div className={styles.tipsterQuickActions}>
        <Link href="/estudio" className={styles.tipsterPrimaryAction}>
          <b>Publicar un tip</b>
          <span>Elegí partido, apuesta y publicá.</span>
        </Link>
        <Link href="/para-tipsters">
          <b>Editar perfil</b>
          <span>Nombre, precio y disponibilidad.</span>
        </Link>
      </div>

      <PaymentAccountCard />

      <div className={styles.simpleDashGrid}>
        <div>
          <small>Suscriptores</small>
          <b>{dashboard.activeSubscribers ?? 0}</b>
        </div>
        <div>
          <small>Ganado</small>
          <b>{money(dashboard.tipsterNetArs)}</b>
        </div>
        <div>
          <small>Disponible</small>
          <b>{money(dashboard.balanceArs)}</b>
        </div>
      </div>

      <section className={styles.simplePayoutBox}>
        <div>
          <h3>Cobrar saldo</h3>
          <p>
            {pending > 0
              ? `Tenés un cobro pendiente por ${money(pending)}.`
              : "Solicitá el retiro de tu saldo disponible."}
          </p>
        </div>

        <button
          className={styles.primary}
          type="button"
          disabled={payoutBusy || balance <= 0 || pending > 0}
          onClick={() => void requestPayout()}
        >
          {payoutBusy
            ? "Solicitando…"
            : pending > 0
              ? "Cobro pendiente"
              : `Cobrar ${money(balance)}`}
        </button>
      </section>

      {promotion?.configured ? (
        <section className={styles.simplePromo}>
          <div>
            <h3>Destacar mi perfil</h3>
            <p>
              Aparecé arriba como Patrocinado.
              {dashboard.activePromotionEndsAt
                ? ` Activo hasta ${date(dashboard.activePromotionEndsAt)}.`
                : ""}
            </p>
          </div>

          <div className={styles.promoOptions}>
            {(promotion.allowedDays ?? [3, 7, 14, 30]).slice(0, 4).map((days) => (
              <button
                key={days}
                type="button"
                disabled={busyDays !== null}
                onClick={() => void buyPromotion(days)}
              >
                {busyDays === days
                  ? "Abriendo…"
                  : `${days} días · ${money(Number(promotion.dailyPriceArs) * days)}`}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {message ? (
        <div className={styles.message}>{message}</div>
      ) : null}
    </>
  );
}
