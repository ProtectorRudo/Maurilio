import type { TipsterHistoryRow } from "@/lib/server/tipster-marketplace";
import styles from "./marketplace.module.css";

function numberValue(value: number | string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function EquityCurve({
  history,
}: {
  history: TipsterHistoryRow[];
}) {
  const chronological = [...history].reverse();
  let cumulative = 0;
  const values = chronological.map((row) => {
    cumulative += numberValue(row.profit_units);
    return cumulative;
  });

  if (values.length < 2) {
    return null;
  }

  const width = 720;
  const height = 190;
  const padding = 18;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = Math.max(max - min, 1);

  const points = values
    .map((value, index) => {
      const x =
        padding +
        (index / Math.max(values.length - 1, 1)) * (width - padding * 2);
      const y =
        height -
        padding -
        ((value - min) / span) * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const zeroY =
    height -
    padding -
    ((0 - min) / span) * (height - padding * 2);

  const latest = values[values.length - 1] ?? 0;

  return (
    <section className={styles.curvePanel}>
      <div className={styles.curveTop}>
        <div>
          <span className={styles.eyebrow}>Trayectoria</span>
          <h3>P&L acumulado</h3>
        </div>
        <div className={styles.curveValue}>
          <small>Últimos {values.length} tips</small>
          <b className={latest >= 0 ? styles.positive : styles.negative}>
            {latest >= 0 ? "+" : ""}{latest.toFixed(2)}u
          </b>
        </div>
      </div>

      <svg
        className={styles.curve}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Curva de beneficio y pérdida acumulada"
      >
        <line
          x1={padding}
          x2={width - padding}
          y1={zeroY}
          y2={zeroY}
          className={styles.zeroLine}
        />
        <polyline
          points={points}
          fill="none"
          className={latest >= 0 ? styles.curvePositive : styles.curveNegative}
        />
      </svg>

      <div className={styles.curveLegend}>
        <span>Mínimo <b>{min.toFixed(2)}u</b></span>
        <span>Máximo <b>{max.toFixed(2)}u</b></span>
        <span>Orden cronológico · sólo tips liquidados</span>
      </div>
    </section>
  );
}
