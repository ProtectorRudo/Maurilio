export type PublicTipster = {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
  headline: string | null;
  sports: string[];
  specialties: string[];
  monthly_price_ars: number | null;
  currency: string;
  is_verified: boolean;
  accepting_subscribers: boolean;
  picks_count_90d: number;
  profit_units_90d: number | null;
  roi_pct_90d: number | null;
  win_rate_pct_90d: number | null;
  avg_odds_90d: number | null;
  avg_clv_pct_90d: number | null;
  max_drawdown_units_90d: number | null;
  last_settled_at: string | null;
  active_subscribers_count: number;
  open_tips_count: number;
  sponsored: boolean;
  sponsor_priority: number;
};

export type TipsterHistoryRow = {
  public_id: string;
  sport: string;
  competition: string;
  event: string;
  market: string;
  selection: string | null;
  bookmaker: string;
  entry_odds: number | string | null;
  closing_odds: number | string | null;
  stake_units: number | string | null;
  event_start_at: string;
  published_at: string;
  settled_at: string | null;
  result: "win" | "loss" | "push" | "void" | null;
  profit_units: number | string | null;
  clv_pct: number | string | null;
  content_hash: string | null;
};


export type PublicTipReceipt = {
  tipster: {
    id: string;
    slug: string;
    display_name: string;
    status: string;
    is_verified: boolean;
  };
  tip: {
    public_id: string;
    sport: string;
    competition: string;
    event: string;
    market: string;
    selection: string | null;
    bookmaker: string;
    entry_odds: number | null;
    closing_odds: number | null;
    stake_units: number | null;
    event_start_at: string;
    published_at: string;
    settled_at: string | null;
    result: "win" | "loss" | "push" | "void" | null;
    profit_units: number | null;
    clv_pct: number | null;
    content_hash: string | null;
    odds_captured_at: string | null;
    provider_price_updated_at: string | null;
    settlement_verified_at: string | null;
  };
};

type RawTipster = Omit<
  PublicTipster,
  | "monthly_price_ars"
  | "picks_count_90d"
  | "profit_units_90d"
  | "roi_pct_90d"
  | "win_rate_pct_90d"
  | "avg_odds_90d"
  | "avg_clv_pct_90d"
  | "max_drawdown_units_90d"
  | "active_subscribers_count"
  | "open_tips_count"
  | "sponsor_priority"
> & {
  monthly_price_ars: number | string | null;
  picks_count_90d: number | string | null;
  profit_units_90d: number | string | null;
  roi_pct_90d: number | string | null;
  win_rate_pct_90d: number | string | null;
  avg_odds_90d: number | string | null;
  avg_clv_pct_90d: number | string | null;
  max_drawdown_units_90d: number | string | null;
  active_subscribers_count: number | string | null;
  open_tips_count: number | string | null;
  sponsor_priority: number | string | null;
};

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function numeric(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function normalize(row: RawTipster): PublicTipster {
  return {
    ...row,
    sports: Array.isArray(row.sports) ? row.sports : [],
    specialties: Array.isArray(row.specialties) ? row.specialties : [],
    monthly_price_ars: numeric(row.monthly_price_ars),
    picks_count_90d: integer(row.picks_count_90d),
    profit_units_90d: numeric(row.profit_units_90d),
    roi_pct_90d: numeric(row.roi_pct_90d),
    win_rate_pct_90d: numeric(row.win_rate_pct_90d),
    avg_odds_90d: numeric(row.avg_odds_90d),
    avg_clv_pct_90d: numeric(row.avg_clv_pct_90d),
    max_drawdown_units_90d: numeric(row.max_drawdown_units_90d),
    active_subscribers_count: integer(row.active_subscribers_count),
    open_tips_count: integer(row.open_tips_count),
    sponsor_priority: integer(row.sponsor_priority),
  };
}

async function rest<T>(path: string, query: URLSearchParams) {
  const cfg = config();
  if (!cfg) throw new Error("database_not_configured");

  const response = await fetch(`${cfg.url}/rest/v1/${path}?${query.toString()}`, {
    headers: {
      apikey: cfg.key,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const raw = await response.text();
  if (!response.ok) {
    console.error("Maurilio marketplace query failed", {
      path,
      status: response.status,
      body: raw.slice(0, 280),
    });
    throw new Error(`marketplace_query_failed_${response.status}`);
  }

  return raw ? (JSON.parse(raw) as T) : (undefined as T);
}

function matches(card: PublicTipster, query: string) {
  if (!query) return true;
  const haystack = [
    card.display_name,
    card.headline ?? "",
    ...card.sports,
    ...card.specialties,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function sortCards(cards: PublicTipster[], sort: string) {
  return [...cards].sort((a, b) => {
    if (sort === "roi") {
      return (
        (b.roi_pct_90d ?? -9999) - (a.roi_pct_90d ?? -9999) ||
        b.picks_count_90d - a.picks_count_90d
      );
    }

    if (sort === "clv") {
      return (
        (b.avg_clv_pct_90d ?? -9999) - (a.avg_clv_pct_90d ?? -9999) ||
        b.picks_count_90d - a.picks_count_90d
      );
    }

    if (sort === "drawdown") {
      return (
        (a.max_drawdown_units_90d ?? Number.POSITIVE_INFINITY) -
          (b.max_drawdown_units_90d ?? Number.POSITIVE_INFINITY) ||
        b.picks_count_90d - a.picks_count_90d
      );
    }

    if (sort === "subscribers") {
      return (
        b.active_subscribers_count - a.active_subscribers_count ||
        b.picks_count_90d - a.picks_count_90d
      );
    }

    if (sort === "price") {
      return (
        (a.monthly_price_ars ?? Number.POSITIVE_INFINITY) -
          (b.monthly_price_ars ?? Number.POSITIVE_INFINITY) ||
        b.picks_count_90d - a.picks_count_90d
      );
    }

    if (sort === "recent") {
      return (
        new Date(b.last_settled_at ?? 0).getTime() -
          new Date(a.last_settled_at ?? 0).getTime() ||
        b.picks_count_90d - a.picks_count_90d
      );
    }

    return (
      b.picks_count_90d - a.picks_count_90d ||
      (b.avg_clv_pct_90d ?? -9999) - (a.avg_clv_pct_90d ?? -9999) ||
      (b.roi_pct_90d ?? -9999) - (a.roi_pct_90d ?? -9999) ||
      a.display_name.localeCompare(b.display_name)
    );
  });
}

export async function getMarketplace(
  input: {
    q?: string;
    sport?: string;
    sort?: string;
    verified?: boolean;
    available?: boolean;
    minHistory?: number;
  } = {},
) {
  const query = new URLSearchParams({ select: "*", limit: "500" });
  const rows = await rest<RawTipster[]>("maurilio_tipster_search_public", query);
  const q = (input.q ?? "").trim().slice(0, 80);
  const sport = (input.sport ?? "").trim().slice(0, 40);
  const sort = (input.sort ?? "history").trim();
  const minHistory = Math.max(0, Math.min(500, Math.trunc(input.minHistory ?? 0)));

  const allCards = rows.map(normalize);

  const cards = allCards
    .filter((card) => matches(card, q))
    .filter(
      (card) =>
        !sport ||
        card.sports.some((item) => item.toLowerCase() === sport.toLowerCase()),
    )
    .filter((card) => !input.verified || card.is_verified)
    .filter((card) => !input.available || card.accepting_subscribers)
    .filter((card) => card.picks_count_90d >= minHistory);

  return {
    sponsored: cards
      .filter((card) => card.sponsored)
      .sort((a, b) => b.sponsor_priority - a.sponsor_priority),
    results: sortCards(
      cards.filter((card) => !card.sponsored),
      sort,
    ),
    sports: [...new Set(rows.flatMap((row) => row.sports || []))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b)),
    total: cards.length,
    summary: {
      totalTipsters: cards.length,
      verifiedTipsters: cards.filter((card) => card.is_verified).length,
      activeSubscribers: cards.reduce(
        (total, card) => total + card.active_subscribers_count,
        0,
      ),
      picks90d: cards.reduce((total, card) => total + card.picks_count_90d, 0),
      acceptingSubscribers: cards.filter((card) => card.accepting_subscribers).length,
    },
  };
}

export async function getTipsterProfile(slug: string) {
  const cleanSlug = slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(cleanSlug)) return null;

  const cardQuery = new URLSearchParams({
    select: "*",
    slug: `eq.${cleanSlug}`,
    limit: "1",
  });
  const cards = await rest<RawTipster[]>(
    "maurilio_tipster_search_public",
    cardQuery,
  );
  if (!cards[0]) return null;
  const tipster = normalize(cards[0]);

  const historyQuery = new URLSearchParams({
    select:
      "public_id,sport,competition,event,market,selection,bookmaker,entry_odds,closing_odds,stake_units,event_start_at,published_at,settled_at,result,profit_units,clv_pct,content_hash",
    tipster_id: `eq.${tipster.id}`,
    status: "eq.settled",
    order: "settled_at.desc",
    limit: "100",
  });

  const history = await rest<TipsterHistoryRow[]>(
    "maurilio_tipster_tips",
    historyQuery,
  );

  return { tipster, history };
}


export async function getPublicTipReceipt(publicId: string) {
  const clean = publicId.trim().toUpperCase();
  if (!/^MT-\d{8}-[A-F0-9]{8}$/.test(clean)) return null;

  const tipQuery = new URLSearchParams({
    select:
      "tipster_id,public_id,sport,competition,event,market,selection,bookmaker,entry_odds,closing_odds,stake_units,event_start_at,published_at,settled_at,result,profit_units,clv_pct,content_hash,odds_captured_at,provider_price_updated_at,settlement_verified_at",
    public_id: "eq." + clean,
    status: "eq.settled",
    limit: "1",
  });

  const tips = await rest<Array<Record<string, unknown>>>(
    "maurilio_tipster_tips",
    tipQuery,
  );
  const row = tips[0];
  if (!row || typeof row.tipster_id !== "string") return null;

  const tipsterQuery = new URLSearchParams({
    select: "id,slug,display_name,status,is_verified",
    id: "eq." + row.tipster_id,
    limit: "1",
  });

  const tipsters = await rest<Array<{
    id: string;
    slug: string;
    display_name: string;
    status: string;
    is_verified: boolean;
  }>>("maurilio_tipsters", tipsterQuery);

  const tipster = tipsters[0];
  if (!tipster) return null;

  const receipt: PublicTipReceipt = {
    tipster,
    tip: {
      public_id: String(row.public_id ?? ""),
      sport: String(row.sport ?? ""),
      competition: String(row.competition ?? ""),
      event: String(row.event ?? ""),
      market: String(row.market ?? ""),
      selection: typeof row.selection === "string" ? row.selection : null,
      bookmaker: String(row.bookmaker ?? ""),
      entry_odds: numeric(row.entry_odds),
      closing_odds: numeric(row.closing_odds),
      stake_units: numeric(row.stake_units),
      event_start_at: String(row.event_start_at ?? ""),
      published_at: String(row.published_at ?? ""),
      settled_at: typeof row.settled_at === "string" ? row.settled_at : null,
      result:
        row.result === "win" ||
        row.result === "loss" ||
        row.result === "push" ||
        row.result === "void"
          ? row.result
          : null,
      profit_units: numeric(row.profit_units),
      clv_pct: numeric(row.clv_pct),
      content_hash:
        typeof row.content_hash === "string" ? row.content_hash : null,
      odds_captured_at:
        typeof row.odds_captured_at === "string" ? row.odds_captured_at : null,
      provider_price_updated_at:
        typeof row.provider_price_updated_at === "string"
          ? row.provider_price_updated_at
          : null,
      settlement_verified_at:
        typeof row.settlement_verified_at === "string"
          ? row.settlement_verified_at
          : null,
    },
  };

  return receipt;
}
