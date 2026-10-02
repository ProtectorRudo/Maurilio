import MarketplaceHeader from "@/components/MarketplaceHeader";
import AccountPanel from "@/components/AccountPanel";
import market from "@/components/marketplace.module.css";
import styles from "@/components/account.module.css";

export default function CuentaPage() {
  return (
    <main className={market.shell}>
      <MarketplaceHeader />
      <section className={styles.hub}>
        <div className={styles.hubTop}>
          <div>
            <span className={market.eyebrow}>Cuenta</span>
            <h1>Mi Maurilio</h1>
          </div>
        </div>
        <AccountPanel />
      </section>
    </main>
  );
}
