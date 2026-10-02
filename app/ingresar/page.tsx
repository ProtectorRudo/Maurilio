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
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeNext(typeof params.next === "string" ? params.next : undefined);

  return (
    <main className={market.shell}>
      <MarketplaceHeader />
      <section className={market.infoPage}>
        <span className={market.eyebrow}>Tu cuenta</span>
        <h1>Entrá a Maurilio.</h1>
        <p>
          Una cuenta sirve para suscribirte a tipsters, acceder a tips futuros y,
          si querés publicar, convertir tu perfil en cuenta de tipster.
        </p>
        <AuthPanel nextPath={nextPath} />
      </section>
    </main>
  );
}
