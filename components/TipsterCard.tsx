import Link from "next/link";
import type { PublicTipster } from "@/lib/server/tipster-marketplace";
import styles from "./marketplace.module.css";

function pct(value: number | null) {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function units(value: number | null) {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}u`;
}

function money(value: number | null) {
  if (value === null || value <= 0) return "Sin precio";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function sampleLabel(count: number) {
  if (count >= 100) return "Muestra amplia";
  if (count >= 50) return "Muestra media";
  if (count >= 25) return "Muestra inicial";
  return "Poca muestra";
}

function activity(value: string | null) {
  if (!value) return "Sin liquidaciones";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

export default function TipsterCard({ tipster }: { tipster: PublicTipster }) {
  const initials = tipster.display_name.slice(0, 2).toUpperCase();
  const roiPositive = (tipster.roi_pct_90d ?? 0) >= 0;
  const pnlPositive = (tipster.profit_units_90d ?? 0) >= 0;

  return (
    <article className={`${styles.card} ${tipster.sponsored ? styles.sponsored : ""}`}>
      <div className={styles.cardBadges}>
        {tipster.sponsored ? (
          <span className={styles.sponsorLabel}>Patrocinado</span>
        ) : null}
        {tipster.is_verified ? (
          <span className={styles.trustBadge}>✓ Verificado</span>
        ) : null}
        <span
          className={`${styles.availabilityBadge} ${
            tipster.accepting_subscribers ? styles.openBadge : styles.closedBadge
          }`}
        >
          {tipster.accepting_subscribers ? "Suscripción abierta" : "Cerrado"}
        </span>
      </div>

      <div className={styles.identity}>
        <div className={styles.avatar}>{initials}</div>
        <div>
          <div className={styles.name}>{tipster.display_name}</div>
          <p className={styles.headline}>
            {tipster.headline ?? "Historial público registrado en Maurilio."}
          </p>
        </div>
      </div>

      <div className={styles.performance}>
        <div className={styles.roiBlock}>
          <small>ROI · 90 días</small>
          <strong className={roiPositive ? styles.positive : styles.negative}>
            {pct(tipster.roi_pct_90d)}
          </strong>
          <span>{sampleLabel(tipster.picks_count_90d)}</span>
        </div>

        <div className={styles.pnlBlock}>
          <small>P&L · 90 días</small>
          <strong className={pnlPositive ? styles.positive : styles.negative}>
            {units(tipster.profit_units_90d)}
          </strong>
          <span>{tipster.picks_count_90d} tips liquidados</span>
        </div>
      </div>

      <div className={styles.copyMetrics}>
        <div>
          <small>CLV</small>
          <b className={(tipster.avg_clv_pct_90d ?? 0) >= 0 ? styles.positive : styles.negative}>
            {pct(tipster.avg_clv_pct_90d)}
          </b>
        </div>
        <div>
          <small>Win rate</small>
          <b>{pct(tipster.win_rate_pct_90d)}</b>
        </div>
        <div>
          <small>Drawdown</small>
          <b>{tipster.max_drawdown_units_90d === null ? "—" : `${tipster.max_drawdown_units_90d.toFixed(2)}u`}</b>
        </div>
        <div>
          <small>Cuota media</small>
          <b>{tipster.avg_odds_90d === null ? "—" : tipster.avg_odds_90d.toFixed(2)}</b>
        </div>
      </div>

      <div className={styles.tags}>
        {[...tipster.sports, ...tipster.specialties].slice(0, 5).map((tag) => (
          <span className={styles.tag} key={tag}>{tag}</span>
        ))}
      </div>

      <div className={styles.socialProof}>
        <span><b>{tipster.active_subscribers_count}</b> suscriptores</span>
        <span><b>{tipster.open_tips_count}</b> tips abiertos</span>
        <span>Última liquidación <b>{activity(tipster.last_settled_at)}</b></span>
      </div>

      <div className={styles.cardFoot}>
        <div className={styles.price}>
          <span>Suscripción mensual</span>
          <b>{money(tipster.monthly_price_ars)}</b>
        </div>
        <Link className={styles.view} href={`/tipsters/${tipster.slug}`}>
          Ver historial
        </Link>
      </div>
    </article>
  );
}
