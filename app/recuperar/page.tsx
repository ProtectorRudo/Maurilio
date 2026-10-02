import MarketplaceHeader from "@/components/MarketplaceHeader";
import RecoveryRequestPanel from "@/components/RecoveryRequestPanel";
import market from "@/components/marketplace.module.css";

export const metadata = {
  title: "Recuperar contraseña — Maurilio",
  robots: { index: false, follow: false },
};

export default function RecuperarPage() {
  return (
    <main className={market.shell}>
      <MarketplaceHeader />
      <section className={market.infoPage}>
        <span className={market.eyebrow}>Seguridad</span>
        <h1>Recuperá tu acceso.</h1>
        <p>
          Te enviaremos un enlace de un solo uso para elegir una nueva contraseña.
        </p>
        <RecoveryRequestPanel />
      </section>
    </main>
  );
}
