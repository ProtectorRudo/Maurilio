"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./marketplace.module.css";

export default function MarketplaceHeader() {
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
  }

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand} onClick={close}>
        <span className={styles.mark}>M</span>
        <span>MAURILIO</span>
      </Link>

      <button
        className={styles.menuButton}
        type="button"
        aria-expanded={open}
        aria-controls="maurilio-navigation"
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        onClick={() => setOpen((value) => !value)}
      >
        <span />
        <span />
        <span />
      </button>

      <nav
        id="maurilio-navigation"
        className={styles.nav + (open ? " " + styles.navOpen : "")}
        aria-label="Navegación principal"
      >
        <Link href="/" onClick={close}>Explorar</Link>
        <Link href="/mis-tips" onClick={close}>Mis tips</Link>
        <Link href="/estudio" onClick={close}>Estudio</Link>
        <Link href="/suscripciones" onClick={close}>Suscripciones</Link>
        <Link href="/para-tipsters" onClick={close}>Para tipsters</Link>
        <Link href="/cuenta" className={styles.login} onClick={close}>Cuenta</Link>
      </nav>
    </header>
  );
}
