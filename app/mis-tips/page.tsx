import MarketplaceHeader from "@/components/MarketplaceHeader";
import PrivateFeed from "@/components/PrivateFeed";
import styles from "@/components/account.module.css";
import market from "@/components/marketplace.module.css";

export default function MisTipsPage() {
  return (
    <main className={market.shell}>
      <MarketplaceHeader />
      <section className={styles.hub}>
        <div className={styles.hubTop}>
          <div>
            <span className={market.eyebrow}>Feed privado</span>
            <h1>Mis tips</h1>
          </div>
          <p>Tips futuros de tus suscripciones activas.</p>
        </div>
        <PrivateFeed />
      </section>
    </main>
  );
}
