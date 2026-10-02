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
  const [fee, setFee] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/maurilio/api/admin/payment-readiness", {
      cache: "no-store",
    });

    if (response.status === 401 || response.status === 403) {
      window.location.assign("/maurilio/ingresar?next=%2Fadmin");
      return;
    }

    const data = await response.json() as PaymentStatus;
    setStatus(data);
    setFee(
      typeof data.platformFeeBps === "number"
        ? (data.platformFeeBps / 100).toString()
        : "",
    );
  }

  useEffect(() => {
    void load().catch(() => setStatus({ error: "unavailable" }));
  }, []);

  async function saveFee() {
    const percent = Number(fee.replace(",", "."));
    const bps = Math.round(percent * 100);

    if (!Number.isFinite(percent) || percent <= 0 || percent > 50) {
      setMessage("Ingresá una comisión entre 0,01% y 50%.");
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/maurilio/api/admin/payment-readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformFeeBps: bps }),
      });

      if (!response.ok) {
        setMessage("No pudimos guardar la comisión.");
        return;
      }

      await load();
      setMessage("Comisión actualizada. Los cobros anteriores no cambian.");
    } catch {
      setMessage("No pudimos guardar la comisión.");
    } finally {
      setSaving(false);
    }
  }

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

  const feeLabel =
    typeof status.platformFeeBps === "number"
      ? (status.platformFeeBps / 100).toFixed(2).replace(/\.00$/, "") + "%"
      : "Sin definir";

  return (
    <section className={styles.paymentReadiness}>
      <div>
        <span className={styles.paymentEyebrow}>Cobros</span>
        <h3>Mercado Pago Split 1:1</h3>
        <p>
          El vendedor recibe su cobro. Maurilio recibe únicamente la comisión.
        </p>

        <div className={styles.feeEditor}>
          <label htmlFor="platform-fee">Comisión Maurilio</label>
          <div>
            <input
              id="platform-fee"
              inputMode="decimal"
              value={fee}
              onChange={(event) => setFee(event.target.value)}
              placeholder="10"
            />
            <span>%</span>
            <button type="button" disabled={saving} onClick={() => void saveFee()}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
          {message ? <small>{message}</small> : null}
        </div>
      </div>

      <div className={styles.paymentReadinessFacts}>
        <span>
          <small>Estado</small>
          <b>{status.configured ? "Listo" : "Falta configurar"}</b>
        </span>
        <span>
          <small>Comisión</small>
          <b>{feeLabel}</b>
        </span>
        <span>
          <small>Acceso</small>
          <b>30 días</b>
        </span>
      </div>
    </section>
  );
}
