import MarketplaceHeader from "@/components/MarketplaceHeader";
import styles from "@/components/marketplace.module.css";

export default function PrivacidadPage() {
  return (
    <main className={styles.shell}>
      <MarketplaceHeader />
      <section className={styles.infoPage}>
        <span className={styles.eyebrow}>Privacidad</span>
        <h1>Guardamos lo necesario para operar y auditar.</h1>
        <p>
          Maurilio utiliza datos de cuenta, suscripción y publicación para prestar
          el servicio, mantener el historial verificable y prevenir abuso.
        </p>

        <div className={styles.notice}>
          <strong>Cuenta.</strong> Podemos tratar email, nombre público, identificadores
          internos y datos técnicos necesarios para autenticación y seguridad.
        </div>

        <div className={styles.notice}>
          <strong>Tipsters.</strong> El perfil público, tips liquidados y métricas
          derivadas forman parte del historial visible de la plataforma. Los tips
          futuros se muestran únicamente a usuarios con acceso vigente.
        </div>

        <div className={styles.notice}>
          <strong>Pagos.</strong> El proveedor de pagos procesa la información de
          checkout. Maurilio conserva referencias, estados, importes, comisiones y
          datos de conciliación necesarios, pero no necesita almacenar los datos
          completos de la tarjeta.
        </div>

        <div className={styles.notice}>
          <strong>Seguridad.</strong> Las sesiones autenticadas usan cookies HTTP-only
          y las rutas privadas se sirven sin caché público. Los registros críticos
          se mantienen separados del acceso directo del navegador.
        </div>

        <div className={styles.notice}>
          <strong>Conservación.</strong> Los registros necesarios para auditoría,
          pagos, prevención de fraude o cumplimiento pueden mantenerse durante el
          período exigido por la operación y la legislación aplicable.
        </div>
      </section>
    </main>
  );
}
