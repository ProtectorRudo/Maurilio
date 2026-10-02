"use client";

import { useEffect, useState } from "react";
import styles from "./account.module.css";

type Tip = {
  public_id: string;
  sport: string;
  competition: string;
  event: string;
  market: string;
  selection: string | null;
  bookmaker: string;
  entry_odds: number | string | null;
  stake_units: number | string | null;
  event_start_at: string;
  odds_captured_at: string | null;
  tipster?: {
    display_name?: string;
    slug?: string;
  } | null;
};

function dateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Horario no disponible";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export default function PrivateFeed() {
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/maurilio/api/feed", { cache: "no-store" });
        if (response.status === 401) {
          window.location.assign("/maurilio/ingresar?next=%2Fmis-tips");
          return;
        }

        const body = await response.json() as { tips?: Tip[] };
        setTips(Array.isArray(body.tips) ? body.tips : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className={styles.empty}><b>Cargando tips privados…</b></div>;
  }

  if (tips.length === 0) {
    return (
      <div className={styles.empty}>
        <b>No hay tips futuros desbloqueados.</b>
        Cuando un tipster al que seguís publique uno nuevo, va a aparecer acá.
      </div>
    );
  }

  return (
    <div className={styles.feed}>
      {tips.map((tip) => {
        const odds = Number(tip.entry_odds);
        return (
          <article className={styles.tip} key={tip.public_id}>
            <div>
              <div className={styles.tipMeta}>
                <span className={styles.pill}>{tip.tipster?.display_name ?? "Tipster"}</span>
                <span className={styles.pill}>{tip.sport}</span>
                <span className={styles.pill}>{tip.competition}</span>
                <span className={styles.pill}>Bet365 verificado</span>
              </div>
              <h3>{tip.event}</h3>
              <p>
                {tip.market}{tip.selection ? ` · ${tip.selection}` : ""}
                {" · "}{dateTime(tip.event_start_at)}
                {Number.isFinite(Number(tip.stake_units)) ? ` · ${Number(tip.stake_units).toFixed(2)}u` : ""}
              </p>
            </div>
            <div className={styles.odds}>
              <small>Cuota capturada</small>
              <b>{Number.isFinite(odds) ? odds.toFixed(2) : "—"}</b>
            </div>
          </article>
        );
      })}
    </div>
  );
}
