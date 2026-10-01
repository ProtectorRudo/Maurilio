import Matchday from "@/components/Matchday";
import { currentMatchday } from "@/lib/demo-data";
import type { Matchday as MatchdayData, Pick } from "@/lib/types";
import {
  databaseConfigured,
  getLatestPublishedMatchday,
  getPublishedPickByTier,
  type MaurilioPickRow,
} from "@/lib/server/supabase-rest";

export const dynamic = "force-dynamic";

function numeric(value: number | string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pctText(value: number | null, digits = 2) {
  if (value === null) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function mapFreePick(row: MaurilioPickRow): Pick | null {
  const odds = numeric(row.entry_odds);
  const minimum = numeric(row.minimum_odds);
  const own = numeric(row.probability_own);
  const low = numeric(row.probability_low);
  const high = numeric(row.probability_high);
  const stake = numeric(row.stake_pct);

  if (odds === null || own === null || odds <= 1 || own <= 0 || own >= 1) {
    return null;
  }

  const implied = 1 / odds;
  const edge = own - implied;
  const ev = own * odds - 1;

  return {
    id: row.public_id,
    tier: "free",
    competition: row.competition,
    event: row.event,
    market: row.selection ? `${row.market} · ${row.selection}` : row.market,
    price: odds.toFixed(2),
    minimum: minimum?.toFixed(2) ?? "—",
    implied: Number((implied * 100).toFixed(1)),
    model: Number((own * 100).toFixed(1)),
    range:
      low !== null && high !== null
        ? `${(low * 100).toFixed(0)}–${(high * 100).toFixed(0)}%`
        : "—",
    edge: Number((edge * 100).toFixed(1)),
    ev: Number((ev * 100).toFixed(1)),
    stake: pctText(stake),
    thesis: row.thesis ?? "Tesis pendiente.",
    risk: row.principal_risk ?? "Riesgo principal pendiente.",
    bookmaker: "Bet365",
    capturedAt: row.odds_captured_at ?? "NO VERIFICADO",
  };
}

async function persistedMatchday(): Promise<MatchdayData | null> {
  if (!databaseConfigured()) return null;

  try {
    const active = await getLatestPublishedMatchday();
    if (!active) return null;

    const freeRow = await getPublishedPickByTier(active.slug, "free");
    if (!freeRow) return null;

    const freePick = mapFreePick(freeRow);
    if (!freePick) return null;

    return {
      label: active.label,
      slug: active.slug,
      date: active.match_date,
      picks: [freePick],
      archivePreview: [
        {
          id: `#${freePick.id}`,
          edge: `${freePick.edge >= 0 ? "+" : ""}${freePick.edge}%`,
          clv: "OPEN",
          status: "PUBLISHED",
        },
        { id: "#PRO", edge: "—", clv: "—", status: "SEALED" },
        { id: "#ELITE", edge: "—", clv: "—", status: "SEALED" },
      ],
    };
  } catch (error) {
    console.error("Unable to load active Maurilio Matchday", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

export default async function Home() {
  const persisted = await persistedMatchday();
  return (
    <Matchday
      matchday={persisted ?? currentMatchday}
      isDemo={!persisted}
    />
  );
}
