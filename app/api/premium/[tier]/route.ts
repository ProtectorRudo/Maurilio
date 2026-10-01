import { NextRequest, NextResponse } from "next/server";
import {
  databaseConfigured,
  getLatestPublishedMatchday,
  getPublishedPickByTier,
  hasActiveEntitlement,
} from "@/lib/server/supabase-rest";

const ACCESS_COOKIE = "maurilio_sid";

function validUuid(value: string | undefined) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
}

function numberOrNull(value: number | string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tier: string }> },
) {
  const { tier } = await context.params;
  if (tier !== "pro" && tier !== "elite") {
    return NextResponse.json({ error: "invalid_tier" }, { status: 400 });
  }

  if (!databaseConfigured()) {
    return NextResponse.json(
      { error: "premium_unavailable" },
      { status: 503 },
    );
  }

  const activeMatchday = await getLatestPublishedMatchday().catch(() => null);
  if (!activeMatchday) {
    return NextResponse.json({ error: "no_active_matchday" }, { status: 404 });
  }

  const subjectId = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!validUuid(subjectId)) {
    return NextResponse.json({ error: "access_required" }, { status: 403 });
  }

  const entitled = await hasActiveEntitlement(
    subjectId!,
    activeMatchday.slug,
    tier,
  ).catch(() => false);

  if (!entitled) {
    return NextResponse.json({ error: "access_required" }, { status: 403 });
  }

  const pick = await getPublishedPickByTier(
    activeMatchday.slug,
    tier,
  ).catch(() => null);

  if (!pick) {
    return NextResponse.json({ error: "report_not_published" }, { status: 404 });
  }

  const odds = numberOrNull(pick.entry_odds);
  const own = numberOrNull(pick.probability_own);
  const low = numberOrNull(pick.probability_low);
  const high = numberOrNull(pick.probability_high);
  const minimum = numberOrNull(pick.minimum_odds);
  const stake = numberOrNull(pick.stake_pct);

  const implied = odds ? 1 / odds : null;
  const edge = implied !== null && own !== null ? own - implied : null;
  const ev = odds !== null && own !== null ? own * odds - 1 : null;

  return NextResponse.json(
    {
      id: pick.public_id,
      matchday: activeMatchday.slug,
      tier,
      sport: pick.sport,
      competition: pick.competition,
      event: pick.event,
      market: pick.market,
      selection: pick.selection,
      bookmaker: pick.bookmaker,
      odds,
      minimumOdds: minimum,
      probability: own,
      probabilityRange:
        low !== null && high !== null ? { low, high } : null,
      impliedProbability: implied,
      edge,
      ev,
      stake,
      thesis: pick.thesis,
      risk: pick.principal_risk,
      capturedAt: pick.odds_captured_at,
      eventStartAt: pick.event_start_at,
      saleStatus: pick.sale_status,
      saleClosedReason: pick.sale_closed_reason,
      lastObservedOdds: numberOrNull(pick.last_observed_odds),
      lastObservedAt: pick.last_observed_at,
      publishedAt: pick.published_at,
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    },
  );
}
