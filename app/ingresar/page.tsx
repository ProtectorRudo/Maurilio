import MarketplaceHeader from "@/components/MarketplaceHeader";
import AuthPanel from "@/components/AuthPanel";
import market from "@/components/marketplace.module.css";

function safeNext(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  const withoutBase = value.startsWith("/maurilio/")
    ? value.slice("/maurilio".length)
    : value === "/maurilio"
      ? "/"
      : value;
  return withoutBase.startsWith("/") && !withoutBase.startsWith("//")
    ? withoutBase
    : "/";
}

export default async function IngresarPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    confirmed?: string;
    reset?: string;
  }>;
}) {
  const params = await searchParams;
  const nextPath = safeNext(
    typeof params.next === "string" ? params.next : undefined,
  );
  const newAccount = params.confirmed === "1";
  const resetDone = params.reset === "1";

  return (
    <main className={market.shell}>
      <MarketplaceHeader />
      <section className={market.infoPage}>
        <span className={market.eyebrow}>Tu cuenta</span>
        <h1>Entrá a Maurilio.</h1>
        <p>
          Una sola cuenta alcanza para seguir tipsters o construir un historial
          como tipster. El camino se elige después de ingresar.
        </p>
        <AuthPanel
          nextPath={nextPath}
          newAccount={newAccount}
          resetDone={resetDone}
        />
      </section>
    </main>
  );
}
