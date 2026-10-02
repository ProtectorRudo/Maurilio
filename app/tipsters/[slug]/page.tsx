import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MarketplaceHeader from "@/components/MarketplaceHeader";
import SubscribeButton from "@/components/SubscribeButton";
import EquityCurve from "@/components/EquityCurve";
import styles from "@/components/marketplace.module.css";
import { getTipsterProfile } from "@/lib/server/tipster-marketplace";

export const dynamic = "force-dynamic";

function pct(value: number | null) {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function units(value: number | null) {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}u`;
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

function activity(value: string | null) {
  if (!value) return "Sin liquidaciones";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
  }).format(parsed);
}

function sampleLabel(count: number) {
  if (count >= 100) return "Muestra amplia";
  if (count >= 50) return "Muestra media";
  if (count >= 25) return "Muestra inicial";
  return "Poca muestra";
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
      title: `${profile.tipster.display_name} — historial público`,
      description:
        profile.tipster.headline ??
        "Historial público registrado y liquidado dentro de Maurilio.",
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
        <Link className={styles.back} href="/">← Volver al ranking</Link>

        <div className={styles.profileTop}>
          <article className={styles.profileCard}>
            <div className={styles.profileBadges}>
              {tipster.is_verified ? (
                <span className={styles.trustBadge}>✓ Cuenta verificada</span>
              ) : null}
              <span className={styles.availabilityBadge}>
                {sampleLabel(tipster.picks_count_90d)}
              </span>
              <span
                className={`${styles.availabilityBadge} ${
                  tipster.accepting_subscribers
                    ? styles.openBadge
                    : styles.closedBadge
                }`}
              >
                {tipster.accepting_subscribers
                  ? "Suscripción abierta"
                  : "Suscripción cerrada"}
              </span>
            </div>

            <h1>{tipster.display_name}</h1>
            <p>
              {tipster.headline ??
                "Historial público registrado dentro de Maurilio."}
            </p>

            <div className={styles.tags}>
              {[...tipster.sports, ...tipster.specialties].map((tag) => (
                <span className={styles.tag} key={tag}>{tag}</span>
              ))}
            </div>

            <div className={styles.profileStatsWide}>
              <div>
                <small>ROI · 90d</small>
                <b className={(tipster.roi_pct_90d ?? 0) >= 0 ? styles.positive : styles.negative}>
                  {pct(tipster.roi_pct_90d)}
                </b>
              </div>
              <div>
                <small>P&L · 90d</small>
                <b className={(tipster.profit_units_90d ?? 0) >= 0 ? styles.positive : styles.negative}>
                  {units(tipster.profit_units_90d)}
                </b>
              </div>
              <div>
                <small>CLV · 90d</small>
                <b className={(tipster.avg_clv_pct_90d ?? 0) >= 0 ? styles.positive : styles.negative}>
                  {pct(tipster.avg_clv_pct_90d)}
                </b>
              </div>
              <div>
                <small>Drawdown máx.</small>
                <b>
                  {tipster.max_drawdown_units_90d === null
                    ? "—"
                    : `${tipster.max_drawdown_units_90d.toFixed(2)}u`}
                </b>
              </div>
              <div>
                <small>Win rate</small>
                <b>{pct(tipster.win_rate_pct_90d)}</b>
              </div>
              <div>
                <small>Cuota media</small>
                <b>
                  {tipster.avg_odds_90d === null
                    ? "—"
                    : tipster.avg_odds_90d.toFixed(2)}
                </b>
              </div>
              <div>
                <small>Tips · 90d</small>
                <b>{tipster.picks_count_90d}</b>
              </div>
              <div>
                <small>Suscriptores</small>
                <b>{tipster.active_subscribers_count}</b>
              </div>
            </div>

            <div className={styles.profileActivity}>
              Última liquidación: <b>{activity(tipster.last_settled_at)}</b>
            </div>
          </article>

          <aside className={styles.lockBox}>
            <span className={styles.eyebrow}>Contenido futuro</span>
            <div className={styles.lockCount}>{tipster.open_tips_count}</div>
            <h3>
              {tipster.open_tips_count === 1
                ? "tip abierto bloqueado"
                : "tips abiertos bloqueados"}
            </h3>
            <p>
              Los tips futuros sólo se muestran a suscriptores con acceso vigente.
              La entrada se registra desde Bet365 cuando el tipster publica.
            </p>

            <div className={styles.subscriptionFacts}>
              <div>
                <small>Precio mensual</small>
                <b>{money(tipster.monthly_price_ars)}</b>
              </div>
              <div>
                <small>Suscriptores activos</small>
                <b>{tipster.active_subscribers_count}</b>
              </div>
            </div>

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

            <p className={styles.lockNote}>
              Suscribirte no garantiza resultados. El historial pasado puede
              ayudarte a evaluar el proceso, no a eliminar el riesgo.
            </p>
          </aside>
        </div>
      </section>

      <section className={styles.history}>
        <EquityCurve history={history} />

        <div className={styles.sectionTop}>
          <div>
            <span className={styles.eyebrow}>Prueba pública</span>
            <h2>Historial liquidado</h2>
          </div>
          <p>Hasta 100 tips. Incluye victorias, derrotas, pushes y voids.</p>
        </div>

        {history.length === 0 ? (
          <div className={styles.empty}>
            <b>Todavía no hay tips liquidados.</b>
            Las métricas aparecerán a medida que exista historial real.
          </div>
        ) : (
          <div className={styles.table}>
            <div className={`${styles.historyRow} ${styles.head}`}>
              <span>Resultado</span>
              <span>Evento</span>
              <span>Mercado</span>
              <span>Entrada</span>
              <span>Cierre</span>
              <span>CLV</span>
              <span>P&L</span>
            </div>

            {history.map((row) => {
              const profit = n(row.profit_units);
              const clv = n(row.clv_pct);
              const entry = n(row.entry_odds);
              const close = n(row.closing_odds);

              return (
                <div className={styles.historyRow} key={row.public_id}>
                  <span
                    className={`${styles.result} ${
                      row.result === "win"
                        ? styles.win
                        : row.result === "loss"
                          ? styles.loss
                          : styles.push
                    }`}
                  >
                    {row.result ?? "—"}
                  </span>
                  <span>
                    <strong>{row.event}</strong>
                    <br />
                    <Link className={styles.hash} href={`/tips/${row.public_id}`}>
                      #{row.public_id}
                    </Link>
                  </span>
                  <span>
                    {row.market}
                    {row.selection ? ` · ${row.selection}` : ""}
                  </span>
                  <span>{entry?.toFixed(2) ?? "—"}</span>
                  <span>{close?.toFixed(2) ?? "—"}</span>
                  <span>
                    {clv === null
                      ? "—"
                      : `${clv >= 0 ? "+" : ""}${clv.toFixed(1)}%`}
                  </span>
                  <span
                    className={(profit ?? 0) >= 0 ? styles.positive : styles.negative}
                  >
                    {profit === null
                      ? "—"
                      : `${profit >= 0 ? "+" : ""}${profit.toFixed(2)}u`}
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
