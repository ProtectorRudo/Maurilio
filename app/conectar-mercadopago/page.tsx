import MarketplaceHeader from "@/components/MarketplaceHeader";
import MercadoPagoCallback from "@/components/MercadoPagoCallback";
import market from "@/components/marketplace.module.css";
import styles from "@/components/account.module.css";

export const metadata = {
  title: "Conectar Mercado Pago — Maurilio",
  robots: { index: false, follow: false },
};

export default async function ConectarMercadoPagoPage({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    state?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <main className={market.shell}>
      <MarketplaceHeader />
      <section className={styles.hub}>
        <MercadoPagoCallback
          code={typeof params.code === "string" ? params.code : ""}
          state={typeof params.state === "string" ? params.state : ""}
          error={typeof params.error === "string" ? params.error : ""}
        />
      </section>
    </main>
  );
}
