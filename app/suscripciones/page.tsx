import MarketplaceHeader from "@/components/MarketplaceHeader";
import SubscriberHub from "@/components/SubscriberHub";
import styles from "@/components/account.module.css";
import market from "@/components/marketplace.module.css";

export default function SuscripcionesPage() {
  return (
    <main className={market.shell}>
      <MarketplaceHeader />
      <section className={styles.hub}>
        <div className={styles.hubTop}>
          <div>
            <span className={market.eyebrow}>Tu cuenta</span>
            <h1>Mis suscripciones</h1>
          </div>
          <p>Controlá renovaciones y acceso vigente.</p>
        </div>
        <SubscriberHub />
      </section>
    </main>
  );
}
