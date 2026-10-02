import Link from "next/link";
import MarketplaceHeader from "@/components/MarketplaceHeader";
import styles from "@/components/marketplace.module.css";

export default function ParaTipstersPage() {
  return (
    <main className={styles.shell}>
      <MarketplaceHeader />
      <section className={styles.infoPage}>
        <span className={styles.eyebrow}>Para tipsters</span>
        <h1>Monetizá un historial que la plataforma pueda auditar.</h1>
        <p>
          Publicás desde cuotas Bet365 registradas por Maurilio, construís estadísticas
          públicas y definís una suscripción mensual. La plataforma cobra una comisión
          sobre cada pago procesado y conserva un ledger del bruto, comisión y neto.
        </p>

        <div className={styles.steps}>
          <article className={styles.step}><span>01</span><h3>Creá tu perfil</h3><p>Nombre público, especialidades, deportes y precio mensual. Tu reputación empieza en cero y se construye acá.</p></article>
          <article className={styles.step}><span>02</span><h3>Publicá desde Bet365</h3><p>No escribís la cuota a mano. Elegís la selección desde el feed y Maurilio guarda el snapshot real.</p></article>
          <article className={styles.step}><span>03</span><h3>Cobrá suscripciones</h3><p>Los suscriptores ven tus tips futuros mientras mantengan acceso vigente. El historial liquidado permanece público.</p></article>
        </div>

        <Link className={styles.cta} href="/ingresar?next=%2Fpara-tipsters">
          Crear cuenta de tipster
        </Link>
      </section>
    </main>
  );
}
