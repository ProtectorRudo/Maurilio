"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./account.module.css";

type Dashboard = {
  tipsterId?: string;
  activeSubscribers?: number;
  pendingSubscribers?: number;
  approvedCharges?: number | string;
  grossArs?: number | string;
  platformFeeArs?: number | string;
  tipsterNetArs?: number | string;
  paidOutArs?: number | string;
  pendingPayoutArs?: number | string;
  balanceArs?: number | string;
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
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const dashboardResponse = await fetch("/maurilio/api/tipster/dashboard", { cache: "no-store" });
      if (dashboardResponse.status === 401) {
        window.location.assign("/maurilio/ingresar?next=%2Fpanel-tipster");
        return;
      }

      const dash = await dashboardResponse.json() as Dashboard;
      if (!dashboardResponse.ok) {
        setDashboard({ error: "profile_required" });
        return;
      }
      setDashboard(dash);

      if (dashboardResponse.ok) {
        const promoResponse = await fetch("/maurilio/api/promotions", { cache: "no-store" });
        if (promoResponse.ok) setPromotion(await promoResponse.json() as PromotionStatus);
      }
    })().catch(() => setDashboard({ error: "unavailable" }));
  }, []);

  async function buyPromotion(days: number) {
    setBusyDays(days);
    setMessage(null);
    try {
      const response = await fetch("/maurilio/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const body = await response.json() as { checkoutUrl?: string; error?: string };
      if (!response.ok || !body.checkoutUrl) {
        setMessage(
          body.error === "promotions_disabled"
            ? "La publicidad interna todavía no está habilitada para cobro."
            : "No pudimos abrir el checkout de publicidad.",
        );
        return;
      }
      if (!/^https:\/\//i.test(body.checkoutUrl)) {
        setMessage("El checkout de publicidad recibido no es válido.");
        return;
      }
      window.location.assign(body.checkoutUrl);
    } catch {
      setMessage("No pudimos abrir el checkout de publicidad.");
    } finally {
      setBusyDays(null);
    }
  }

  if (!dashboard) return <div className={styles.empty}><b>Cargando panel…</b></div>;

  if (dashboard.error) {
    return (
      <div className={styles.empty}>
        <b>Necesitás un perfil tipster para usar este panel.</b>
        <Link href="/para-tipsters">Configurar perfil</Link>
      </div>
    );
  }

  return (
    <>
      <div className={styles.dashGrid}>
        <div className={styles.dashMetric}><small>Suscriptores activos</small><b>{dashboard.activeSubscribers ?? 0}</b></div>
        <div className={styles.dashMetric}><small>Bruto cobrado</small><b>{money(dashboard.grossArs)}</b></div>
        <div className={styles.dashMetric}><small>Comisión Maurilio</small><b>{money(dashboard.platformFeeArs)}</b></div>
        <div className={styles.dashMetric}><small>Neto tipster</small><b>{money(dashboard.tipsterNetArs)}</b></div>
        <div className={styles.dashMetric}><small>Saldo disponible</small><b>{money(dashboard.balanceArs)}</b></div>
        <div className={styles.dashMetric}><small>Pagado</small><b>{money(dashboard.paidOutArs)}</b></div>
        <div className={styles.dashMetric}><small>Pago pendiente</small><b>{money(dashboard.pendingPayoutArs)}</b></div>
        <div className={styles.dashMetric}><small>Cobros aprobados</small><b>{dashboard.approvedCharges ?? 0}</b></div>
      </div>

      <div className={styles.actions}>
        <Link href="/estudio">Publicar nuevo tip</Link>
        <Link href="/para-tipsters">Editar perfil y precio</Link>
      </div>

      <section className={styles.promo}>
        <h3>Publicidad interna</h3>
        <p>
          Tu perfil aparece arriba como “Patrocinado”. La publicidad modifica
          visibilidad, nunca ROI, CLV, resultados ni orden orgánico de reputación.
          {dashboard.activePromotionEndsAt
            ? ` Tu promoción actual termina el ${date(dashboard.activePromotionEndsAt) ?? "día indicado"}.`
            : ""}
        </p>

        {promotion?.configured ? (
          <div className={styles.promoOptions}>
            {(promotion.allowedDays ?? [3, 7, 14, 30]).map((days) => (
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
        ) : (
          <p>La compra de posiciones patrocinadas todavía no está habilitada.</p>
        )}

        {message ? <div className={`${styles.message} ${styles.error}`}>{message}</div> : null}
      </section>
    </>
  );
}
