import MarketplaceHeader from "@/components/MarketplaceHeader";
import AdminTipsterConsole from "@/components/AdminTipsterConsole";
import market from "@/components/marketplace.module.css";
import styles from "@/components/account.module.css";

export const metadata = {
  title: "Administración — Maurilio",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <main className={market.shell}>
      <MarketplaceHeader />
      <section className={styles.hub}>
        <div className={styles.hubTop}>
          <div>
            <span className={market.eyebrow}>Administración</span>
            <h1>Moderación de tipsters</h1>
          </div>
          <p>Verificación, suspensión y trazabilidad administrativa.</p>
        </div>
        <AdminTipsterConsole />
      </section>
    </main>
  );
}
