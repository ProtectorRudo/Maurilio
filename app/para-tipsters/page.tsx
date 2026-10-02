import MarketplaceHeader from "@/components/MarketplaceHeader";
import TipsterProfileForm from "@/components/TipsterProfileForm";
import styles from "@/components/marketplace.module.css";
import account from "@/components/account.module.css";

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

        <section className={account.formSection}>
          <h2>Tu perfil de tipster</h2>
          <p>
            Podés crear o editar tu perfil desde acá. El rol tipster se activa únicamente
            sobre tu propia cuenta autenticada; no se acepta desde metadata del registro.
          </p>
          <div style={{ marginTop: 20 }}>
            <TipsterProfileForm />
          </div>
        </section>
      </section>
    </main>
  );
}
