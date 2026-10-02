"use client";

import { useEffect, useState } from "react";
import styles from "./account.module.css";

type PaymentStatus = {
  configured?: boolean;
  provider?: string;
  mode?: string;
  renewalMode?: string;
  platformFeeBps?: number | null;
  error?: string;
};

export default function AdminPaymentReadiness() {
  const [status, setStatus] = useState<PaymentStatus | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/maurilio/api/admin/payment-readiness", {
          cache: "no-store",
        });

        if (response.status === 401) {
          window.location.assign("/maurilio/ingresar?next=%2Fadmin");
          return;
        }

        setStatus(await response.json() as PaymentStatus);
      } catch {
        setStatus({ error: "unavailable" });
      }
    })();
  }, []);

  if (!status) {
    return <div className={styles.paymentReadiness}><b>Revisando cobros…</b></div>;
  }

  if (status.error) {
    return (
      <div className={styles.paymentReadiness}>
        <b>Cobros no disponibles</b>
        <span>No pudimos verificar la configuración.</span>
      </div>
    );
  }

  const fee =
    typeof status.platformFeeBps === "number"
      ? (status.platformFeeBps / 100).toFixed(1) + "%"
      : "—";

  return (
    <section className={styles.paymentReadiness}>
      <div>
        <span className={styles.paymentEyebrow}>Cobros</span>
        <h3>Mercado Pago Split 1:1</h3>
        <p>
          El vendedor recibe su cobro. Maurilio recibe únicamente la comisión.
        </p>
      </div>

      <div className={styles.paymentReadinessFacts}>
        <span>
          <small>Estado</small>
          <b>{status.configured ? "Listo" : "Falta configurar"}</b>
        </span>
        <span>
          <small>Comisión</small>
          <b>{fee}</b>
        </span>
        <span>
          <small>Acceso</small>
          <b>30 días</b>
        </span>
      </div>
    </section>
  );
}
