import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  verifyAdminSession,
} from "@/lib/server/admin-auth";
import {
  databaseConfigured,
  getLatestPublishedMatchday,
  getPublishedPickByTier,
  publishMatchdayBundle,
} from "@/lib/server/supabase-rest";

export const runtime = "nodejs";

type Tier = "free" | "pro" | "elite";

type PublishPickInput = {
  publicId?: unknown;
  tier?: unknown;
  sport?: unknown;
  competition?: unknown;
  event?: unknown;
  market?: unknown;
  selection?: unknown;
  entryOdds?: unknown;
  minimumOdds?: unknown;
  probabilityOwn?: unknown;
  probabilityLow?: unknown;
  probabilityHigh?: unknown;
  stakePct?: unknown;
  stakeArs?: unknown;
  thesis?: unknown;
  principalRisk?: unknown;
  oddsCapturedAt?: unknown;
};

type PublishBody = {
  slug?: unknown;
  matchDate?: unknown;
  label?: unknown;
  noValue?: unknown;
  picks?: unknown;
};

function authorized(request: NextRequest) {
  return verifyAdminSession(request.cookies.get(ADMIN_COOKIE)?.value);
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numericValue(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function normalisePick(value: PublishPickInput) {
  const tier = textValue(value.tier) as Tier;
  const entryOdds = numericValue(value.entryOdds);
  const minimumOdds = numericValue(value.minimumOdds);
  const probabilityOwn = numericValue(value.probabilityOwn);
  const probabilityLow = numericValue(value.probabilityLow);
  const probabilityHigh = numericValue(value.probabilityHigh);
  const stakePct = numericValue(value.stakePct);
  const stakeArs = numericValue(value.stakeArs);

  if (!["free", "pro", "elite"].includes(tier)) {
    throw new Error("invalid_tier");
  }
  if (!entryOdds || entryOdds <= 1) throw new Error("invalid_entry_odds");
  if (!minimumOdds || minimumOdds <= 1) throw new Error("invalid_minimum_odds");
  if (entryOdds < minimumOdds) throw new Error("entry_below_minimum");
  if (
    probabilityOwn === null ||
    probabilityOwn <= 0 ||
    probabilityOwn >= 1 ||
    probabilityLow === null ||
    probabilityHigh === null ||
    probabilityLow > probabilityOwn ||
    probabilityHigh < probabilityOwn ||
    probabilityLow < 0 ||
    probabilityHigh > 1
  ) {
    throw new Error("invalid_probability");
  }
  if (stakePct === null || stakePct <= 0 || stakePct > 0.02) {
    throw new Error("invalid_stake");
  }
  if (probabilityOwn * entryOdds - 1 <= 0) {
    throw new Error("non_positive_ev");
  }

  const publicId = textValue(value.publicId);
  const competition = textValue(value.competition);
  const event = textValue(value.event);
  const market = textValue(value.market);
  const thesis = textValue(value.thesis);
  const principalRisk = textValue(value.principalRisk);
  const oddsCapturedAt = textValue(value.oddsCapturedAt);

  if (
    !publicId ||
    !competition ||
    !event ||
    !market ||
    !thesis ||
    !principalRisk ||
    !oddsCapturedAt
  ) {
    throw new Error("missing_pick_fields");
  }

  const captured = new Date(oddsCapturedAt);
  if (Number.isNaN(captured.getTime())) {
    throw new Error("invalid_capture_time");
  }

  return {
    public_id: publicId,
    tier,
    sport: textValue(value.sport) || "football",
    competition,
    event,
    market,
    selection: textValue(value.selection) || null,
    bookmaker: "Bet365",
    entry_odds: entryOdds,
    minimum_odds: minimumOdds,
    probability_own: probabilityOwn,
    probability_low: probabilityLow,
    probability_high: probabilityHigh,
    stake_pct: stakePct,
    stake_ars: stakeArs,
    thesis,
    principal_risk: principalRisk,
    odds_captured_at: captured.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!databaseConfigured()) {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }

  const active = await getLatestPublishedMatchday().catch(() => null);
  if (!active) {
    return NextResponse.json(
      { matchday: null, picks: [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const [free, pro, elite] = await Promise.all([
    getPublishedPickByTier(active.slug, "free"),
    getPublishedPickByTier(active.slug, "pro"),
    getPublishedPickByTier(active.slug, "elite"),
  ]);

  return NextResponse.json(
    {
      matchday: active,
      picks: [free, pro, elite].filter(Boolean),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!databaseConfigured()) {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }

  let body: PublishBody;
  try {
    body = (await request.json()) as PublishBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const slug = textValue(body.slug);
  const matchDate = textValue(body.matchDate);
  const label = textValue(body.label);
  const noValue = body.noValue === true;
  const sourcePicks = Array.isArray(body.picks)
    ? (body.picks as PublishPickInput[])
    : [];

  if (!slug || !/^\d{4}-\d{2}-\d{2}$/.test(matchDate) || !label) {
    return NextResponse.json(
      { error: "invalid_matchday_fields" },
      { status: 400 },
    );
  }

  if (noValue && sourcePicks.length > 0) {
    return NextResponse.json(
      { error: "no_value_cannot_have_picks" },
      { status: 400 },
    );
  }

  if (!noValue && sourcePicks.length === 0) {
    return NextResponse.json(
      { error: "at_least_one_pick_required" },
      { status: 400 },
    );
  }

  try {
    const picks = noValue ? [] : sourcePicks.map(normalisePick);
    const tiers = picks.map((pick) => pick.tier);
    if (new Set(tiers).size !== tiers.length) {
      return NextResponse.json({ error: "duplicate_tier" }, { status: 400 });
    }

    const matchdayId = await publishMatchdayBundle({
      slug,
      match_date: matchDate,
      label,
      no_value: noValue,
      picks,
    });

    return NextResponse.json(
      {
        ok: true,
        matchdayId,
        noValue,
        publishedPicks: picks.length,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Matchday publication failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "publish_failed" },
      { status: 422 },
    );
  }
}
