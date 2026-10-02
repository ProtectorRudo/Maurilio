import MarketplaceHeader from "@/components/MarketplaceHeader";
import styles from "@/components/marketplace.module.css";

export default function TerminosPage() {
  return (
    <main className={styles.shell}>
      <MarketplaceHeader />
      <section className={styles.infoPage}>
        <span className={styles.eyebrow}>Términos de uso</span>
        <h1>Reglas simples para un historial verificable.</h1>
        <p>
          Al usar Maurilio aceptás que la plataforma funciona como marketplace
          de contenido de tipsters y no como operador de apuestas.
        </p>

        <div className={styles.notice}>
          <strong>Suscripciones.</strong> El precio y la periodicidad se muestran
          antes del checkout. La renovación puede cancelarse; el acceso ya abonado
          continúa hasta el final del período vigente cuando corresponda.
        </div>

        <div className={styles.notice}>
          <strong>Contenido de tipsters.</strong> Los resultados pasados no garantizan
          resultados futuros. Cada tipster es responsable del contenido que publica.
          Maurilio registra evidencia y métricas, pero no garantiza rentabilidad.
        </div>

        <div className={styles.notice}>
          <strong>Integridad.</strong> Está prohibido manipular resultados, identidades,
          pagos, cuotas, historial o cualquier mecanismo destinado a crear una
          reputación artificial. Maurilio puede restringir o retirar perfiles ante
          fraude, abuso o incumplimiento.
        </div>

        <div className={styles.notice}>
          <strong>Pagos y comisiones.</strong> Las suscripciones se procesan mediante
          proveedores externos. Maurilio puede retener una comisión de plataforma
          informada al tipster y conservar un registro de bruto, comisión y neto.
        </div>

        <div className={styles.notice}>
          <strong>Disponibilidad.</strong> Los feeds deportivos, cuotas y servicios
          externos pueden sufrir retrasos o interrupciones. Si una cuota Bet365 no
          puede verificarse, Maurilio no debe inventarla ni sustituirla por otra casa.
        </div>
      </section>
    </main>
  );
}
