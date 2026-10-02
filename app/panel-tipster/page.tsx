import MarketplaceHeader from "@/components/MarketplaceHeader";
import TipsterDashboard from "@/components/TipsterDashboard";
import market from "@/components/marketplace.module.css";
import styles from "@/components/account.module.css";

export default function PanelTipsterPage() {
  return (
    <main className={market.shell}>
      <MarketplaceHeader />
      <section className={styles.hub}>
        <div className={styles.hubTop}>
          <div>
            <span className={market.eyebrow}>Mi perfil tipster</span>
            <h1>Panel</h1>
          </div>
        </div>
        <TipsterDashboard />
      </section>
    </main>
  );
}
