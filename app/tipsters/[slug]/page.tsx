import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MarketplaceHeader from "@/components/MarketplaceHeader";
import SubscribeButton from "@/components/SubscribeButton";
import styles from "@/components/marketplace.module.css";
import { getTipsterProfile } from "@/lib/server/tipster-marketplace";

export const dynamic = "force-dynamic";

function pct(value: number | null) {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function n(value: number | string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: number | null) {
  if (value === null || value <= 0) return "No disponible";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const profile = await getTipsterProfile(slug);
    if (!profile) return { title: "Tipster no encontrado" };
    return {
      title: `${profile.tipster.display_name} — historial verificado`,
      description: profile.tipster.headline ?? "Historial público verificado en Maurilio.",
    };
  } catch {
    return { title: "Perfil de tipster" };
  }
}

export default async function TipsterProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let profile: Awaited<ReturnType<typeof getTipsterProfile>>;
  try {
    profile = await getTipsterProfile(slug);
  } catch (error) {
    console.error("Unable to load tipster profile", {
      slug,
      error: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  }

  if (!profile) notFound();

  const { tipster, history } = profile;

  return (
    <main className={styles.shell}>
      <MarketplaceHeader />

      <section className={styles.profileHero}>
        <Link className={styles.back} href="/">← Volver a explorar</Link>

        <div className={styles.profileTop}>
          <article className={styles.profileCard}>
            <span className={styles.eyebrow}>
              {tipster.is_verified ? "✓ Historial verificado" : "Perfil público"}
            </span>
            <h1>{tipster.display_name}</h1>
            <p>{tipster.headline ?? "Historial público registrado dentro de Maurilio."}</p>

            <div className={styles.tags}>
              {[...tipster.sports, ...tipster.specialties].map((tag) => (
                <span className={styles.tag} key={tag}>{tag}</span>
              ))}
            </div>

            <div className={styles.profileStats}>
              <div><small>ROI 90d</small><b className={(tipster.roi_pct_90d ?? 0) >= 0 ? styles.positive : styles.negative}>{pct(tipster.roi_pct_90d)}</b></div>
              <div><small>CLV 90d</small><b className={(tipster.avg_clv_pct_90d ?? 0) >= 0 ? styles.positive : styles.negative}>{pct(tipster.avg_clv_pct_90d)}</b></div>
              <div><small>Win rate</small><b>{pct(tipster.win_rate_pct_90d)}</b></div>
              <div><small>Tips 90d</small><b>{tipster.picks_count_90d}</b></div>
            </div>
          </article>

          <aside className={styles.lockBox}>
            <span className={styles.eyebrow}>Tips futuros</span>
            <div className={styles.lockCount}>{tipster.open_tips_count}</div>
            <h3>Bloqueados hasta suscribirte</h3>
            <p>
              El historial pasado queda visible para todos. Los tips abiertos sólo se
              muestran a suscriptores con acceso vigente.
            </p>
            <p><strong>{money(tipster.monthly_price_ars)}</strong> / mes</p>

            {tipster.accepting_subscribers && tipster.monthly_price_ars ? (
              <SubscribeButton
                slug={tipster.slug}
                returnPath={`/tipsters/${tipster.slug}`}
              />
            ) : (
              <span className={`${styles.cta} ${styles.ctaDisabled}`}>
                Suscripciones no disponibles
              </span>
            )}
          </aside>
        </div>
      </section>

      <section className={styles.history}>
        <div className={styles.sectionTop}>
          <div>
            <span className={styles.eyebrow}>Prueba pública</span>
            <h2>Historial verificado</h2>
          </div>
          <p>Hasta 100 tips liquidados. Sin borrar derrotas.</p>
        </div>

        {history.length === 0 ? (
          <div className={styles.empty}>
            <b>Todavía no hay tips liquidados.</b>
            Las métricas aparecerán cuando exista historial suficiente.
          </div>
        ) : (
          <div className={styles.table}>
            <div className={`${styles.row} ${styles.head}`}>
              <span>Resultado</span>
              <span>Evento</span>
              <span>Mercado</span>
              <span>Entrada</span>
              <span>CLV</span>
              <span>P&L</span>
            </div>

            {history.map((row) => {
              const profit = n(row.profit_units);
              const clv = n(row.clv_pct);
              return (
                <div className={styles.row} key={row.public_id}>
                  <span className={`${styles.result} ${row.result === "win" ? styles.win : row.result === "loss" ? styles.loss : styles.push}`}>
                    {row.result ?? "—"}
                  </span>
                  <span>
                    <strong>{row.event}</strong><br />
                    <span className={styles.hash}>#{row.public_id}</span>
                  </span>
                  <span>{row.market}{row.selection ? ` · ${row.selection}` : ""}</span>
                  <span>{n(row.entry_odds)?.toFixed(2) ?? "—"}</span>
                  <span>{clv === null ? "—" : `${clv >= 0 ? "+" : ""}${clv.toFixed(1)}%`}</span>
                  <span className={(profit ?? 0) >= 0 ? styles.positive : styles.negative}>
                    {profit === null ? "—" : `${profit >= 0 ? "+" : ""}${profit.toFixed(2)}u`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
