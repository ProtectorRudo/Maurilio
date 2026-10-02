import MarketplaceHeader from "@/components/MarketplaceHeader";
import PasswordResetPanel from "@/components/PasswordResetPanel";
import market from "@/components/marketplace.module.css";

export const metadata = {
  title: "Nueva contraseña — Maurilio",
  robots: { index: false, follow: false },
};

export default function ActualizarClavePage() {
  return (
    <main className={market.shell}>
      <MarketplaceHeader />
      <section className={market.infoPage}>
        <span className={market.eyebrow}>Seguridad</span>
        <h1>Elegí una nueva contraseña.</h1>
        <p>
          El enlace de recuperación se valida antes de permitir el cambio.
        </p>
        <PasswordResetPanel />
      </section>
    </main>
  );
}
