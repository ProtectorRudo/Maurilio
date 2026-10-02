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

  return (
    <main className={styles.shell}>
      <MarketplaceHeader />

      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Marketplace de tipsters verificables</span>
          <h1>Seguí personas por datos. No por promesas.</h1>
          <p>
            Cada resultado público sale del historial registrado dentro de Maurilio.
            Los tips futuros permanecen bloqueados hasta que te suscribís, y la cuota
            de entrada se captura desde Bet365.
          </p>
        </div>

        <aside className={styles.heroPanel}>
          <span className={styles.eyebrow}>La regla de Maurilio</span>
          <div className={styles.proofRow}>
            <div className={styles.proof}>
              <b>100%</b>
              <span>Historial pasado visible</span>
            </div>
            <div className={styles.proof}>
              <b>Bet365</b>
              <span>Cuota de entrada registrada</span>
            </div>
            <div className={styles.proof}>
              <b>Inmutable</b>
              <span>El tip publicado no se reescribe</span>
            </div>
          </div>
        </aside>
      </section>

      <section className={styles.searchWrap} aria-label="Buscar tipsters">
        <form className={styles.search} method="get">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por tipster, deporte o especialidad"
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
            <option value="roi">ROI 90 días</option>
            <option value="clv">CLV 90 días</option>
          </select>

          <button type="submit">Buscar</button>
        </form>
      </section>

      <section className={styles.main}>
        {marketplace.sponsored.length > 0 ? (
          <>
            <div className={styles.sectionTop}>
              <div>
                <span className={styles.eyebrow}>Publicidad interna</span>
                <h2>Destacados</h2>
              </div>
              <p>Posiciones pagadas. El rendimiento nunca se altera por publicidad.</p>
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
          <p>{marketplace.total} resultado{marketplace.total === 1 ? "" : "s"}</p>
        </div>

        {unavailable ? (
          <div className={styles.empty}>
            <b>El marketplace no está disponible ahora.</b>
            La información pública no pudo cargarse. No mostramos datos inventados.
          </div>
        ) : marketplace.results.length > 0 ? (
          <div className={styles.grid}>
            {marketplace.results.map((tipster) => (
              <TipsterCard key={tipster.id} tipster={tipster} />
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <b>No encontramos tipsters con esos filtros.</b>
            Probá otra búsqueda o quitá alguno de los filtros.
          </div>
        )}
      </section>
    </main>
  );
}
