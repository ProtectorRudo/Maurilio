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
      title: `${profile.tipster.display_name} — Maurilio`,
      description:
        profile.tipster.headline ??
        "Perfil público con historial registrado en Maurilio.",
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
  const profile = await getTipsterProfile(slug);
  if (!profile) notFound();

  const { tipster, history } = profile;

  return (
    <main className={styles.shell}>
      <MarketplaceHeader />

      <section className={styles.simpleProfile}>
        <Link className={styles.back} href="/">← Volver</Link>

        <div className={styles.simpleProfileGrid}>
          <article className={styles.profileCard}>
            <div className={styles.simpleProfileHead}>
              <div>
                <div className={styles.profileBadges}>
                  {tipster.is_verified ? (
                    <span className={styles.trustBadge}>✓ Verificado</span>
                  ) : null}
                  <span className={styles.availabilityBadge}>
                    {tipster.accepting_subscribers ? "Disponible" : "No disponible"}
                  </span>
                </div>
                <h1>{tipster.display_name}</h1>
                <p>
                  {tipster.headline ??
                    "Historial público registrado dentro de Maurilio."}
                </p>
              </div>
            </div>

            <div className={styles.simpleProfileMetrics}>
              <div>
                <small>ROI 90d</small>
                <b className={(tipster.roi_pct_90d ?? 0) >= 0 ? styles.positive : styles.negative}>
                  {pct(tipster.roi_pct_90d)}
                </b>
              </div>
              <div>
                <small>Tips</small>
                <b>{tipster.picks_count_90d}</b>
              </div>
              <div>
                <small>Suscriptores</small>
                <b>{tipster.active_subscribers_count}</b>
              </div>
            </div>

            <div className={styles.simpleTags}>
              {[...tipster.sports, ...tipster.specialties].slice(0, 5).map((tag) => (
                <span className={styles.tag} key={tag}>{tag}</span>
              ))}
            </div>
          </article>

          <aside className={styles.simpleSubscribeBox}>
            <span>Acceso por 30 días</span>
            <strong>{money(tipster.monthly_price_ars)}</strong>
            <p>
              El pago va directo al tipster. Maurilio cobra únicamente su comisión.
            </p>

            {tipster.open_tips_count > 0 ? (
              <div className={styles.openTipsNotice}>
                {tipster.open_tips_count} tip{tipster.open_tips_count === 1 ? "" : "s"} abierto{tipster.open_tips_count === 1 ? "" : "s"}
              </div>
            ) : null}

            {tipster.accepting_subscribers && tipster.monthly_price_ars ? (
              <SubscribeButton
                slug={tipster.slug}
                returnPath={`/tipsters/${tipster.slug}`}
              />
            ) : (
              <span className={`${styles.cta} ${styles.ctaDisabled}`}>
                Acceso no disponible
              </span>
            )}
          </aside>
        </div>
      </section>

      <section className={styles.history}>
        <div className={styles.sectionTop}>
          <div>
            <span className={styles.eyebrow}>Historial</span>
            <h2>Últimos resultados</h2>
          </div>
          <p>Cada ID abre el comprobante completo.</p>
        </div>

        {history.length === 0 ? (
          <div className={styles.empty}>
            <b>Todavía no hay resultados.</b>
            El historial aparecerá cuando se liquiden los primeros tips.
          </div>
        ) : (
          <div className={styles.table}>
            <div className={`${styles.simpleHistoryRow} ${styles.head}`}>
              <span>Resultado</span>
              <span>Evento</span>
              <span>Cuota</span>
              <span>P&L</span>
            </div>

            {history.map((row) => {
              const profit = n(row.profit_units);
              const entry = n(row.entry_odds);

              return (
                <div className={styles.simpleHistoryRow} key={row.public_id}>
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
                    <small>{row.market}{row.selection ? ` · ${row.selection}` : ""}</small>
                    <br />
                    <Link className={styles.hash} href={`/tips/${row.public_id}`}>
                      #{row.public_id}
                    </Link>
                  </span>
                  <span>{entry?.toFixed(2) ?? "—"}</span>
                  <span className={(profit ?? 0) >= 0 ? styles.positive : styles.negative}>
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
