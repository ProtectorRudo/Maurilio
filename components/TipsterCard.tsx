import Link from "next/link";
import type { PublicTipster } from "@/lib/server/tipster-marketplace";
import styles from "./marketplace.module.css";

function pct(value: number | null) {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function money(value: number | null) {
  if (value === null || value <= 0) return "Sin precio";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function TipsterCard({ tipster }: { tipster: PublicTipster }) {
  const initials = tipster.display_name.slice(0, 2).toUpperCase();

  return (
    <article className={`${styles.simpleCard} ${tipster.sponsored ? styles.sponsored : ""}`}>
      <div className={styles.simpleCardTop}>
        <div className={styles.identity}>
          <div className={styles.avatar}>{initials}</div>
          <div>
            <div className={styles.name}>
              {tipster.display_name}
              {tipster.is_verified ? (
                <span className={styles.verified} title="Cuenta verificada">✓</span>
              ) : null}
            </div>
            <p className={styles.headline}>
              {tipster.headline ?? "Historial público en Maurilio."}
            </p>
          </div>
        </div>

        {tipster.sponsored ? (
          <span className={styles.sponsorLabel}>Patrocinado</span>
        ) : null}
      </div>

      <div className={styles.simpleMetrics}>
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
        {[...tipster.sports, ...tipster.specialties].slice(0, 3).map((tag) => (
          <span className={styles.tag} key={tag}>{tag}</span>
        ))}
      </div>

      <div className={styles.cardFoot}>
        <div className={styles.price}>
          <span>30 días</span>
          <b>{money(tipster.monthly_price_ars)}</b>
        </div>
        <Link className={styles.view} href={`/tipsters/${tipster.slug}`}>
          Ver perfil
        </Link>
      </div>
    </article>
  );
}
