import Link from "next/link";
import MarketplaceHeader from "@/components/MarketplaceHeader";
import TipsterCard from "@/components/TipsterCard";
import styles from "@/components/marketplace.module.css";
import { getMarketplace } from "@/lib/server/tipster-marketplace";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  q?: string;
  sport?: string;
  sort?: string;
}>;

export default async function Home({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const sport = typeof params.sport === "string" ? params.sport : "";
  const sort = typeof params.sort === "string" ? params.sort : "history";

  let marketplace: Awaited<ReturnType<typeof getMarketplace>> = {
    sponsored: [],
    results: [],
    sports: [],
    total: 0,
    summary: {
      totalTipsters: 0,
      verifiedTipsters: 0,
      activeSubscribers: 0,
      picks90d: 0,
      acceptingSubscribers: 0,
    },
  };
  let unavailable = false;

  try {
    marketplace = await getMarketplace({ q, sport, sort });
  } catch (error) {
    unavailable = true;
    console.error("Unable to load Maurilio marketplace", {
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  const filtersActive = Boolean(q || sport || sort !== "history");

  return (
    <main className={styles.shell}>
      <MarketplaceHeader />

      <section className={styles.simpleHero}>
        <span className={styles.eyebrow}>Tipsters con historial real</span>
        <h1>Encontrá a quién seguir.</h1>
        <p>
          Mirá resultados, historial y precio. Los tips futuros se desbloquean
          cuando te suscribís.
        </p>
        <div className={styles.heroActions}>
          <a className={styles.heroPrimary} href="#tipsters">Ver tipsters</a>
          <Link className={styles.heroSecondary} href="/para-tipsters">
            Quiero ser tipster
          </Link>
        </div>
        <div className={styles.simpleTrust}>
          <span>✓ Tips publicados antes del evento</span>
          <span>✓ Cuota Bet365 registrada</span>
          <span>✓ Historial no editable</span>
        </div>
      </section>

      <section className={styles.searchWrap} aria-label="Buscar tipsters" id="tipsters">
        <form className={styles.simpleSearch} method="get">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar tipster o especialidad"
            aria-label="Buscar tipsters"
          />

          <select name="sport" defaultValue={sport} aria-label="Filtrar por deporte">
            <option value="">Todos los deportes</option>
            {marketplace.sports.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>

          <select name="sort" defaultValue={sort} aria-label="Ordenar tipsters">
            <option value="history">Más historial</option>
            <option value="roi">Mayor ROI</option>
            <option value="subscribers">Más seguidos</option>
          </select>

          <button type="submit">Buscar</button>
        </form>

        <div className={styles.resultLine}>
          <span>{marketplace.total} tipster{marketplace.total === 1 ? "" : "s"}</span>
          {filtersActive ? <Link href="/">Limpiar</Link> : null}
        </div>
      </section>

      <section className={styles.main}>
        {marketplace.sponsored.length > 0 ? (
          <>
            <div className={styles.sectionTop}>
              <div>
                <span className={styles.eyebrow}>Patrocinados</span>
                <h2>Destacados</h2>
              </div>
              <p>La posición es paga. El historial no cambia.</p>
            </div>
            <div className={styles.grid}>
              {marketplace.sponsored.map((tipster) => (
                <TipsterCard key={tipster.id} tipster={tipster} />
              ))}
            </div>
          </>
        ) : null}

        <div className={styles.sectionTop}>
          <div>
            <span className={styles.eyebrow}>Explorar</span>
            <h2>Tipsters</h2>
          </div>
        </div>

        {unavailable ? (
          <div className={styles.empty}>
            <b>No pudimos cargar el marketplace.</b>
            Intentá de nuevo en unos minutos.
          </div>
        ) : marketplace.results.length > 0 ? (
          <div className={styles.grid}>
            {marketplace.results.map((tipster) => (
              <TipsterCard key={tipster.id} tipster={tipster} />
            ))}
          </div>
        ) : filtersActive ? (
          <div className={styles.empty}>
            <b>No encontramos resultados.</b>
            Probá otra búsqueda.
            <div className={styles.emptyActions}>
              <Link href="/">Ver todos</Link>
            </div>
          </div>
        ) : (
          <div className={styles.empty}>
            <b>Todavía no hay tipsters públicos.</b>
            Los primeros perfiles aparecerán cuando tengan historial real.
            <div className={styles.emptyActions}>
              <Link href="/para-tipsters">Crear perfil tipster</Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
