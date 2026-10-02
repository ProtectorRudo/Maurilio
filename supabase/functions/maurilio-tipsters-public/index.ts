import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Json = Record<string, unknown> | Array<unknown>;

type TipsterCard = {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
  headline: string | null;
  sports: string[];
  specialties: string[];
  monthly_price_ars: number | string | null;
  currency: string;
  is_verified: boolean;
  accepting_subscribers: boolean;
  picks_count_90d: number;
  roi_pct_90d: number | string | null;
  win_rate_pct_90d: number | string | null;
  avg_odds_90d: number | string | null;
  avg_clv_pct_90d: number | string | null;
  max_drawdown_units_90d: number | string | null;
  open_tips_count: number;
  sponsored: boolean;
  sponsor_priority: number;
};

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
  "X-Content-Type-Options": "nosniff",
};

function reply(body: Json, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function config() {
  const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const key =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    (() => {
      try {
        const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
        return keys.default as string | undefined;
      } catch {
        return undefined;
      }
    })();

  if (!url || !key) throw new Error("server_config_missing");
  return { url, key };
}

async function db<T>(path: string): Promise<T> {
  const { url, key } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });

  const raw = await response.text();
  if (!response.ok) {
    console.error("tipster_public_db_failed", path, response.status, raw.slice(0, 240));
    throw new Error(`db_failed_${response.status}`);
  }

  return raw ? JSON.parse(raw) as T : undefined as T;
}

function n(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normaliseCard(row: TipsterCard) {
  return {
    ...row,
    monthly_price_ars: n(row.monthly_price_ars),
    picks_count_90d: Number(row.picks_count_90d || 0),
    roi_pct_90d: n(row.roi_pct_90d),
    win_rate_pct_90d: n(row.win_rate_pct_90d),
    avg_odds_90d: n(row.avg_odds_90d),
    avg_clv_pct_90d: n(row.avg_clv_pct_90d),
    max_drawdown_units_90d: n(row.max_drawdown_units_90d),
    open_tips_count: Number(row.open_tips_count || 0),
    sponsor_priority: Number(row.sponsor_priority || 0),
  };
}

function matches(card: ReturnType<typeof normaliseCard>, query: string) {
  if (!query) return true;
  const haystack = [
    card.display_name,
    card.headline ?? "",
    ...card.sports,
    ...card.specialties,
  ].join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function sortCards(
  cards: ReturnType<typeof normaliseCard>[],
  sort: string,
) {
  return [...cards].sort((a, b) => {
    if (sort === "roi") {
      return (b.roi_pct_90d ?? -9999) - (a.roi_pct_90d ?? -9999)
        || b.picks_count_90d - a.picks_count_90d;
    }
    if (sort === "clv") {
      return (b.avg_clv_pct_90d ?? -9999) - (a.avg_clv_pct_90d ?? -9999)
        || b.picks_count_90d - a.picks_count_90d;
    }
    return b.picks_count_90d - a.picks_count_90d
      || (b.roi_pct_90d ?? -9999) - (a.roi_pct_90d ?? -9999)
      || a.display_name.localeCompare(b.display_name);
  });
}

Deno.serve(async (request) => {
  if (request.method !== "GET") {
    return reply({ error: "method_not_allowed" }, 405);
  }

  try {
    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "search";

    if (view === "profile") {
      const slug = (url.searchParams.get("slug") ?? "").trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) {
        return reply({ error: "invalid_slug" }, 400);
      }

      const rows = await db<TipsterCard[]>(
        `maurilio_tipster_search_public?select=*&slug=eq.${encodeURIComponent(slug)}&limit=1`,
      );
      const card = rows[0] ? normaliseCard(rows[0]) : null;
      if (!card) return reply({ error: "tipster_not_found" }, 404);

      const history = await db<Array<Record<string, unknown>>>(
        `maurilio_tipster_tips?select=public_id,sport,competition,event,market,selection,bookmaker,entry_odds,closing_odds,stake_units,event_start_at,published_at,settled_at,result,profit_units,clv_pct,content_hash&tipster_id=eq.${encodeURIComponent(card.id)}&status=eq.settled&order=settled_at.desc&limit=100`,
      );

      return reply({
        tipster: card,
        history,
        future: {
          locked: true,
          count: card.open_tips_count,
        },
      });
    }

    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
    const sport = (url.searchParams.get("sport") ?? "").trim().slice(0, 40);
    const sort = (url.searchParams.get("sort") ?? "history").trim();

    const rows = await db<TipsterCard[]>(
      "maurilio_tipster_search_public?select=*&limit=500",
    );

    const cards = rows
      .map(normaliseCard)
      .filter((card) => matches(card, q))
      .filter((card) => !sport || card.sports.some((item) => item.toLowerCase() === sport.toLowerCase()));

    const sponsored = [...cards]
      .filter((card) => card.sponsored)
      .sort((a, b) => b.sponsor_priority - a.sponsor_priority);

    const organic = sortCards(
      cards.filter((card) => !card.sponsored),
      sort,
    );

    const sports = [...new Set(rows.flatMap((row) => row.sports || []))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return reply({
      sponsored,
      results: organic,
      sports,
      total: cards.length,
      note: "Only platform-recorded settled tips contribute to public performance.",
    });
  } catch (error) {
    console.error("tipster_public_failed", error);
    return reply({ error: "tipsters_unavailable" }, 503);
  }
});
