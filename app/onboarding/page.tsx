import Link from "next/link";
import MarketplaceHeader from "@/components/MarketplaceHeader";
import market from "@/components/marketplace.module.css";
import account from "@/components/account.module.css";

export const metadata = {
  title: "Elegí cómo usar Maurilio",
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return (
    <main className={market.shell}>
      <MarketplaceHeader />
      <section className={market.infoPage}>
        <span className={market.eyebrow}>Primer paso</span>
        <h1>¿Cómo querés usar Maurilio?</h1>
        <p>
          No es una decisión permanente. Podés seguir tipsters y más adelante
          crear tu propio perfil con la misma cuenta.
        </p>

        <div className={account.choiceGrid}>
          <article className={account.choiceCard}>
            <span>01</span>
            <h2>Quiero seguir tipsters</h2>
            <p>
              Compará ROI, CLV, drawdown, muestra e historial antes de suscribirte.
              Los tips futuros se desbloquean sólo con acceso vigente.
            </p>
            <Link href="/">Explorar marketplace</Link>
          </article>

          <article className={account.choiceCard}>
            <span>02</span>
            <h2>Quiero ser tipster</h2>
            <p>
              Creá un perfil, elegí líneas Bet365 desde el Estudio y construí
              reputación con un historial que no podés reescribir.
            </p>
            <Link href="/para-tipsters">Crear perfil tipster</Link>
          </article>
        </div>

        <div className={market.notice}>
          Una cuenta común nunca obtiene permisos administrativos por elegir una
          opción de onboarding. El rol tipster se activa únicamente sobre la
          propia cuenta al crear el perfil.
        </div>
      </section>
    </main>
  );
}
