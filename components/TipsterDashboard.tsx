"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PaymentAccountCard from "@/components/PaymentAccountCard";
import styles from "./account.module.css";

type Dashboard = {
  activeSubscribers?: number;
  approvedCharges?: number | string;
  grossArs?: number | string;
  platformFeeArs?: number | string;
  paymentConnected?: boolean;
  acceptingSubscribers?: boolean;
  monthlyPriceArs?: number | string | null;
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
  const [salesBusy, setSalesBusy] = useState(false);
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

  async function toggleSales() {
    if (!dashboard) return;

    setSalesBusy(true);
    setMessage(null);

    try {
      const next = !Boolean(dashboard.acceptingSubscribers);
      const response = await fetch("/maurilio/api/tipster/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepting: next }),
      });
      const body = await response.json() as { error?: string };

      if (!response.ok) {
        setMessage(
          body.error === "payment_account_required"
            ? "Conectá Mercado Pago antes de habilitar ventas."
            : body.error === "valid_subscription_price_required"
              ? "Definí un precio mayor a cero antes de habilitar ventas."
              : "No pudimos actualizar las ventas.",
        );
        return;
      }

      await loadDashboard();
      setMessage(next ? "Ventas habilitadas." : "Ventas pausadas.");
    } catch {
      setMessage("No pudimos actualizar las ventas.");
    } finally {
      setSalesBusy(false);
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
      const body = await response.json() as { checkoutUrl?: string };

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

  if (!dashboard) return <div className={styles.empty}><b>Cargando panel…</b></div>;

  if (dashboard.error) {
    return (
      <div className={styles.empty}>
        <b>Primero creá tu perfil tipster.</b>
        <Link href="/para-tipsters">Crear perfil</Link>
      </div>
    );
  }

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

      <section className={styles.salesSwitch}>
        <div>
          <span className={styles.paymentEyebrow}>Ventas</span>
          <h3>
            {dashboard.acceptingSubscribers ? "Perfil disponible" : "Ventas pausadas"}
          </h3>
          <p>
            {dashboard.paymentConnected
              ? dashboard.acceptingSubscribers
                ? "Los usuarios pueden comprar 30 días de acceso."
                : "Habilitá las ventas cuando quieras empezar a cobrar."
              : "Primero conectá Mercado Pago para recibir los cobros directamente."}
          </p>
        </div>

        {dashboard.paymentConnected && Number(dashboard.monthlyPriceArs) > 0 ? (
          <button
            className={dashboard.acceptingSubscribers ? styles.secondary : styles.primary}
            type="button"
            disabled={salesBusy}
            onClick={() => void toggleSales()}
          >
            {salesBusy
              ? "Guardando…"
              : dashboard.acceptingSubscribers
                ? "Pausar ventas"
                : "Habilitar ventas"}
          </button>
        ) : !dashboard.paymentConnected ? null : (
          <Link className={styles.secondary} href="/para-tipsters">
            Definir precio
          </Link>
        )}
      </section>

      <div className={styles.simpleDashGrid}>
        <div>
          <small>Suscriptores</small>
          <b>{dashboard.activeSubscribers ?? 0}</b>
        </div>
        <div>
          <small>Ventas cobradas</small>
          <b>{money(dashboard.grossArs)}</b>
        </div>
        <div>
          <small>Comisión Maurilio</small>
          <b>{money(dashboard.platformFeeArs)}</b>
        </div>
      </div>

      <p className={styles.paymentNote}>
        El dinero de cada venta lo recibe tu cuenta de Mercado Pago. Maurilio sólo cobra su comisión.
        Mercado Pago puede descontar sus propios cargos al vendedor.
      </p>

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

      {message ? <div className={styles.message}>{message}</div> : null}
    </>
  );
}
