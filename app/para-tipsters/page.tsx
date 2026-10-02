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
        <h1>Publicá. Construí historial. Cobrá suscripciones.</h1>
        <p>
          Maurilio registra tus tips antes del partido y muestra tus resultados
          públicamente. Vos elegís el precio por 30 días y cobrás directo en tu
          Mercado Pago.
        </p>

        <div className={styles.steps}>
          <article className={styles.step}>
            <span>01</span>
            <h3>Creá tu perfil</h3>
            <p>Nombre, deporte, especialidad y precio.</p>
          </article>
          <article className={styles.step}>
            <span>02</span>
            <h3>Publicá tus tips</h3>
            <p>Elegís la apuesta desde las cuotas disponibles de Bet365.</p>
          </article>
          <article className={styles.step}>
            <span>03</span>
            <h3>Cobrá directo</h3>
            <p>El usuario paga en Mercado Pago. Maurilio sólo recibe su comisión.</p>
          </article>
        </div>

        <section className={account.formSection}>
          <h2>Tu perfil</h2>
          <p>Completalo una vez. Después podés modificarlo desde tu cuenta.</p>
          <div style={{ marginTop: 20 }}>
            <TipsterProfileForm />
          </div>
        </section>
      </section>
    </main>
  );
}
