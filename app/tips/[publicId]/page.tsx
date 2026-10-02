import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MarketplaceHeader from "@/components/MarketplaceHeader";
import styles from "@/components/marketplace.module.css";
import { getPublicTipReceipt } from "@/lib/server/tipster-marketplace";

export const dynamic = "force-dynamic";

function numberValue(value: number | null, digits = 2) {
  if (value === null) return "—";
  return value.toFixed(digits);
}

function signed(value: number | null, suffix = "") {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}${suffix}`;
}

function dateTime(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string }>;
}): Promise<Metadata> {
  const { publicId } = await params;
  try {
    const receipt = await getPublicTipReceipt(publicId);
    if (!receipt) return { title: "Tip no encontrado" };
    return {
      title: `${receipt.tip.public_id} — comprobante de tip`,
      description: `${receipt.tip.event} · ${receipt.tip.market} · historial liquidado en Maurilio.`,
      robots: { index: false, follow: true },
    };
  } catch {
    return {
      title: "Comprobante de tip",
      robots: { index: false, follow: true },
    };
  }
}

export default async function TipReceiptPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const receipt = await getPublicTipReceipt(publicId);
  if (!receipt) notFound();

  const { tip, tipster } = receipt;
  const resultClass =
    tip.result === "win"
      ? styles.win
      : tip.result === "loss"
        ? styles.loss
        : styles.push;

  return (
    <main className={styles.shell}>
      <MarketplaceHeader />

      <section className={styles.receiptPage}>
        <div className={styles.receiptNav}>
          {tipster.status === "published" ? (
            <Link href={`/tipsters/${tipster.slug}`}>
              ← Volver a {tipster.display_name}
            </Link>
          ) : (
            <Link href="/">← Volver al marketplace</Link>
          )}
          <span>{tip.public_id}</span>
        </div>

        <article className={styles.receiptCard}>
          <div className={styles.receiptBadges}>
            <span className={`${styles.result} ${resultClass}`}>
              {tip.result ?? "—"}
            </span>
            <span className={styles.trustBadge}>Bet365 registrado</span>
            {tipster.is_verified ? (
              <span className={styles.trustBadge}>✓ Tipster verificado</span>
            ) : null}
          </div>

          <span className={styles.eyebrow}>Comprobante público de integridad</span>
          <h1>{tip.event}</h1>
          <p>
            {tip.market}
            {tip.selection ? ` · ${tip.selection}` : ""}
          </p>

          <div className={styles.receiptMetrics}>
            <div>
              <small>Cuota entrada</small>
              <b>{numberValue(tip.entry_odds)}</b>
            </div>
            <div>
              <small>Cuota cierre</small>
              <b>{numberValue(tip.closing_odds)}</b>
            </div>
            <div>
              <small>CLV</small>
              <b className={(tip.clv_pct ?? 0) >= 0 ? styles.positive : styles.negative}>
                {signed(tip.clv_pct, "%")}
              </b>
            </div>
            <div>
              <small>P&L</small>
              <b className={(tip.profit_units ?? 0) >= 0 ? styles.positive : styles.negative}>
                {signed(tip.profit_units, "u")}
              </b>
            </div>
          </div>

          <div className={styles.receiptGrid}>
            <div><small>Tipster</small><b>{tipster.display_name}</b></div>
            <div><small>Deporte</small><b>{tip.sport || "—"}</b></div>
            <div><small>Competencia</small><b>{tip.competition || "—"}</b></div>
            <div><small>Stake</small><b>{numberValue(tip.stake_units)}u</b></div>
            <div><small>Publicado</small><b>{dateTime(tip.published_at)}</b></div>
            <div><small>Cuota capturada</small><b>{dateTime(tip.odds_captured_at)}</b></div>
            <div><small>Inicio del evento</small><b>{dateTime(tip.event_start_at)}</b></div>
            <div><small>Precio proveedor actualizado</small><b>{dateTime(tip.provider_price_updated_at)}</b></div>
            <div><small>Liquidado</small><b>{dateTime(tip.settled_at)}</b></div>
            <div><small>Settlement verificado</small><b>{dateTime(tip.settlement_verified_at)}</b></div>
          </div>

          <div className={styles.hashBox}>
            <div>
              <small>SHA-256 del contenido publicado</small>
              <code>{tip.content_hash ?? "No disponible"}</code>
            </div>
            <p>
              El hash cubre identidad del tipster, evento, mercado, selección,
              cuota Bet365 de entrada, stake y timestamps de publicación/evento.
              Esos campos no pueden editarse ni borrarse después de publicar.
            </p>
          </div>

          <div className={styles.integrityNote}>
            <b>Qué demuestra este comprobante</b>
            <p>
              La selección existía antes del evento, quedó asociada a una cuota
              Bet365 capturada por servidor y el registro liquidado conserva
              resultado, cierre, CLV y P&L. Una vez liquidado, esas métricas también
              quedan congeladas por la base de datos.
            </p>
          </div>
        </article>
      </section>
    </main>
  );
}
