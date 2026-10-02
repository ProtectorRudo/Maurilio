import MarketplaceHeader from "@/components/MarketplaceHeader";
import styles from "@/components/marketplace.module.css";

export default function JuegoResponsablePage() {
  return (
    <main className={styles.shell}>
      <MarketplaceHeader />
      <section className={styles.infoPage}>
        <span className={styles.eyebrow}>Juego responsable</span>
        <h1>Un tip no elimina el riesgo.</h1>
        <p>
          Maurilio organiza información y registros de tipsters. No garantiza
          resultados, no ofrece apuestas y no debe usarse como sustituto de una
          decisión financiera personal.
        </p>

        <div className={styles.steps}>
          <article className={styles.step}>
            <span>01</span>
            <h3>18+</h3>
            <p>El contenido está dirigido exclusivamente a personas mayores de edad.</p>
          </article>
          <article className={styles.step}>
            <span>02</span>
            <h3>Límites primero</h3>
            <p>No uses dinero destinado a necesidades básicas, deudas o emergencias.</p>
          </article>
          <article className={styles.step}>
            <span>03</span>
            <h3>Sin persecución</h3>
            <p>Una pérdida no justifica aumentar el riesgo para “recuperar” dinero.</p>
          </article>
        </div>

        <div className={styles.notice}>
          Si apostar deja de ser entretenimiento, interrumpí la actividad y buscá
          asistencia profesional o los recursos oficiales de juego responsable
          disponibles en tu jurisdicción.
        </div>
      </section>
    </main>
  );
}
