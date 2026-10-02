"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./account.module.css";

export default function MercadoPagoCallback({
  code,
  state,
  error,
}: {
  code: string;
  state: string;
  error: string;
}) {
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    error ? "error" : "loading",
  );

  useEffect(() => {
    if (error || !code || !state) {
      setStatus("error");
      return;
    }

    void (async () => {
      try {
        const response = await fetch("/maurilio/api/tipster/payment-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "complete", code, state }),
        });

        if (!response.ok) {
          setStatus("error");
          return;
        }

        setStatus("success");
      } catch {
        setStatus("error");
      }
    })();
  }, [code, state, error]);

  if (status === "loading") {
    return <div className={styles.empty}><b>Conectando Mercado Pago…</b></div>;
  }

  if (status === "error") {
    return (
      <div className={styles.empty}>
        <b>No pudimos conectar Mercado Pago.</b>
        Volvé a tu panel e intentá nuevamente.
        <div className={styles.emptyAction}>
          <Link href="/panel-tipster">Volver al panel</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.empty}>
      <b>Mercado Pago conectado.</b>
      Ya podés recibir pagos directamente en tu cuenta.
      <div className={styles.emptyAction}>
        <Link href="/panel-tipster">Volver al panel</Link>
      </div>
    </div>
  );
}
