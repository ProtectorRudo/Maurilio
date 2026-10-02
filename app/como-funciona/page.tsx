import MarketplaceHeader from "@/components/MarketplaceHeader";
import styles from "@/components/marketplace.module.css";

export default function ComoFuncionaPage() {
  return (
    <main className={styles.shell}>
      <MarketplaceHeader />
      <section className={styles.infoPage}>
        <span className={styles.eyebrow}>Cómo funciona</span>
        <h1>La reputación se construye con registros, no capturas.</h1>
        <p>
          Maurilio separa lo que ya ocurrió de lo que todavía tiene valor comercial.
          El pasado sirve para auditar al tipster; el futuro queda reservado a quienes
          mantienen una suscripción activa.
        </p>

        <div className={styles.steps}>
          <article className={styles.step}><span>01</span><h3>El tipster publica</h3><p>Elige un evento y una selección desde el feed de Bet365. Maurilio captura cuota, hora, mercado y evidencia.</p></article>
          <article className={styles.step}><span>02</span><h3>El tip queda sellado</h3><p>Después de publicar no se puede editar el precio ni el contenido para mejorar artificialmente el historial.</p></article>
          <article className={styles.step}><span>03</span><h3>El resultado se liquida</h3><p>El sistema registra resultado, beneficio/pérdida y, cuando existe, cuota de cierre para calcular CLV.</p></article>
        </div>

        <div className={styles.notice}>
          La publicidad interna sólo modifica la posición donde aparece un tipster.
          Nunca cambia ROI, CLV, cantidad de tips ni resultados históricos.
        </div>
      </section>
    </main>
  );
}
