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
    <div className={styles.accountCard}>
      <h2>{account.displayName || account.tipster?.displayName || "Tu cuenta"}</h2>
      <p>
        Desde acá podés entrar a tu feed privado, administrar suscripciones o,
        si sos tipster, gestionar el estudio y tus ingresos.
      </p>

      <div className={styles.accountMeta}>
        <div><small>Rol</small><b>{account.role ?? "user"}</b></div>
        <div><small>Perfil tipster</small><b>{account.tipster?.slug ? `@${account.tipster.slug}` : "No creado"}</b></div>
      </div>

      <div className={styles.actions}>
        <Link href="/mis-tips">Mis tips</Link>
        <Link href="/suscripciones">Suscripciones</Link>
        {account.tipster ? <Link href="/panel-tipster">Panel tipster</Link> : <Link href="/para-tipsters">Crear perfil tipster</Link>}
        {account.tipster ? <Link href="/estudio">Publicar tip</Link> : null}
        <button className={styles.secondary} type="button" onClick={() => void logout()}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
