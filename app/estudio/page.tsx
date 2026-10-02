import MarketplaceHeader from "@/components/MarketplaceHeader";
import TipsterStudio from "@/components/TipsterStudio";
import market from "@/components/marketplace.module.css";
import styles from "@/components/studio.module.css";

export default function EstudioPage() {
  return (
    <main className={market.shell}>
      <MarketplaceHeader />
      <section className={styles.studio}>
        <TipsterStudio />
      </section>
    </main>
  );
}
