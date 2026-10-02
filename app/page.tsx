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
  verified?: string;
  available?: string;
  minHistory?: string;
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
  const verified = params.verified === "1";
  const available = params.available === "1";
  const parsedHistory = Number(params.minHistory);
  const minHistory = Number.isFinite(parsedHistory)
    ? Math.max(0, Math.min(500, Math.trunc(parsedHistory)))
    : 0;

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
    marketplace = await getMarketplace({
      q,
      sport,
      sort,
      verified,
      available,
      minHistory,
    });
  } catch (error) {
    unavailable = true;
    console.error("Unable to load Maurilio marketplace", {
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  const filtersActive = Boolean(
    q || sport || verified || available || minHistory > 0 || sort !== "history",
  );

  return (
    <main className={styles.shell}>
      <MarketplaceHeader />

      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Marketplace de tipsters verificables</span>
          <h1>Compará historial. Después decidí a quién seguir.</h1>
          <p>
            Maurilio registra tips antes del evento, captura la cuota desde Bet365
            y expone el historial liquidado. El contenido futuro queda bloqueado
            para suscriptores.
          </p>

          <div className={styles.heroActions}>
            <a className={styles.heroPrimary} href="#ranking">Explorar tipsters</a>
            <Link className={styles.heroSecondary} href="/para-tipsters">
              Quiero ser tipster
            </Link>
          </div>
        </div>

        <aside className={styles.heroPanel}>
          <span className={styles.eyebrow}>Qué podés auditar</span>
          <div className={styles.proofRow}>
            <div className={styles.proof}>
              <b>ROI + P&L</b>
              <span>Rendimiento sobre tips liquidados</span>
            </div>
            <div className={styles.proof}>
              <b>CLV</b>
              <span>Entrada vs. cierre Bet365</span>
            </div>
            <div className={styles.proof}>
              <b>Drawdown</b>
              <span>Riesgo histórico en unidades</span>
            </div>
          </div>
          <p className={styles.heroFinePrint}>
            Una muestra grande no garantiza ganancias futuras. Sirve para evaluar
            evidencia con más contexto.
          </p>
        </aside>
      </section>

      <section className={styles.marketStrip} aria-label="Resumen del marketplace">
        <div>
          <small>Tipsters</small>
          <b>{marketplace.summary.totalTipsters}</b>
        </div>
        <div>
          <small>Verificados</small>
          <b>{marketplace.summary.verifiedTipsters}</b>
        </div>
        <div>
          <small>Tips liquidados · 90d</small>
          <b>{marketplace.summary.picks90d}</b>
        </div>
        <div>
          <small>Suscripciones activas</small>
          <b>{marketplace.summary.activeSubscribers}</b>
        </div>
      </section>

      <section className={styles.searchWrap} aria-label="Buscar tipsters" id="ranking">
        <form className={styles.searchPanel} method="get">
          <div className={styles.searchMain}>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Buscar tipster, deporte o especialidad"
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
              <option value="roi">Mayor ROI 90d</option>
              <option value="clv">Mayor CLV 90d</option>
              <option value="drawdown">Menor drawdown</option>
              <option value="subscribers">Más suscriptores</option>
              <option value="recent">Actividad reciente</option>
              <option value="price">Menor precio</option>
            </select>

            <select
              name="minHistory"
              defaultValue={String(minHistory)}
              aria-label="Mínimo de tips liquidados"
            >
              <option value="0">Cualquier muestra</option>
              <option value="25">25+ tips</option>
              <option value="50">50+ tips</option>
              <option value="100">100+ tips</option>
            </select>

            <button type="submit">Aplicar</button>
          </div>

          <div className={styles.quickFilters}>
            <label>
              <input
                type="checkbox"
                name="verified"
                value="1"
                defaultChecked={verified}
              />
              Sólo verificados
            </label>
            <label>
              <input
                type="checkbox"
                name="available"
                value="1"
                defaultChecked={available}
              />
              Aceptando suscriptores
            </label>
            <span>{marketplace.total} resultado{marketplace.total === 1 ? "" : "s"}</span>
            {filtersActive ? <Link href="/">Limpiar filtros</Link> : null}
          </div>
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
              <p>La posición es paga. Las métricas son las mismas del historial real.</p>
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
            <span className={styles.eyebrow}>Ranking público · últimos 90 días</span>
            <h2>Tipsters</h2>
          </div>
          <p>No existe un “mejor” automático: compará retorno, riesgo y muestra.</p>
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
        ) : filtersActive ? (
          <div className={styles.empty}>
            <b>No encontramos tipsters con esos filtros.</b>
            Probá ampliar la muestra, quitar filtros o cambiar el deporte.
            <div className={styles.emptyActions}>
              <Link href="/">Ver todos</Link>
            </div>
          </div>
        ) : (
          <div className={styles.empty}>
            <b>Todavía no hay tipsters públicos con historial real.</b>
            El marketplace arranca vacío antes que rellenarse con estadísticas ficticias.
            <div className={styles.emptyActions}>
              <Link href="/para-tipsters">Ser de los primeros tipsters</Link>
              <Link href="/como-funciona">Cómo se verifica el historial</Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
