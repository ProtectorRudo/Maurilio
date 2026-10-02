import Link from "next/link";
import styles from "./marketplace.module.css";

export default function MarketplaceHeader() {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        <span className={styles.mark}>M</span>
        <span>MAURILIO</span>
      </Link>
      <nav className={styles.nav} aria-label="Navegación principal">
        <Link href="/">Explorar</Link>
        <Link href="/mis-tips">Mis tips</Link>
        <Link href="/estudio">Estudio</Link>
        <Link href="/suscripciones">Suscripciones</Link>
        <Link href="/para-tipsters">Para tipsters</Link>
        <Link href="/cuenta" className={styles.login}>Cuenta</Link>
      </nav>
    </header>
  );
}
