"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./account.module.css";

type Account = {
  userId?: string;
  role?: string;
  displayName?: string | null;
  tipster?: {
    slug?: string;
    displayName?: string;
  } | null;
  error?: string;
};

export default function AccountPanel() {
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/maurilio/api/account", { cache: "no-store" });
        if (response.status === 401) {
          window.location.assign("/maurilio/ingresar?next=%2Fcuenta");
          return;
        }
        setAccount(await response.json() as Account);
      } catch {
        setAccount({ error: "unavailable" });
      }
    })();
  }, []);

  async function logout() {
    await fetch("/maurilio/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/maurilio");
  }

  if (!account) return <div className={styles.empty}><b>Cargando cuenta…</b></div>;
  if (account.error) return <div className={styles.empty}><b>No pudimos cargar tu cuenta.</b></div>;

  return (
    <div className={styles.accountSimple}>
      <div className={styles.accountWelcome}>
        <h2>{account.displayName || account.tipster?.displayName || "Tu cuenta"}</h2>
        <p>Elegí qué querés hacer.</p>
      </div>

      <div className={styles.accountActionsGrid}>
        <Link href="/mis-tips">
          <b>Mis tips</b>
          <span>Ver tips de tus suscripciones</span>
        </Link>

        <Link href="/suscripciones">
          <b>Mis suscripciones</b>
          <span>Ver y administrar accesos</span>
        </Link>

        {account.tipster ? (
          <>
            <Link href="/estudio">
              <b>Publicar tip</b>
              <span>Abrir el Estudio</span>
            </Link>
            <Link href="/panel-tipster">
              <b>Mi panel tipster</b>
              <span>Ingresos, cobros y perfil</span>
            </Link>
          </>
        ) : (
          <Link href="/para-tipsters">
            <b>Ser tipster</b>
            <span>Crear tu perfil público</span>
          </Link>
        )}

        {account.role === "admin" ? (
          <Link href="/admin">
            <b>Administración</b>
            <span>Moderación y pagos</span>
          </Link>
        ) : null}
      </div>

      <button
        className={styles.logoutSimple}
        type="button"
        onClick={() => void logout()}
      >
        Cerrar sesión
      </button>
    </div>
  );
}
