import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Json = Record<string, unknown> | Array<unknown>;

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function response(body: Json, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
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

  if (!url || !key) throw new Error("supabase_server_config_missing");
  return { url, key };
}

async function db<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { url, key } = config();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const raw = await res.text();
  if (!res.ok) {
    console.error("db_request_failed", path, res.status, raw.slice(0, 300));
    throw new Error(`db_request_failed_${res.status}`);
  }

  return raw ? JSON.parse(raw) as T : undefined as T;
}

async function riskSnapshot() {
  try {
    return await db<Record<string, unknown>>(
      "rpc/maurilio_risk_snapshot",
      { method: "POST", body: "{}" },
    );
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") {
    return response({ error: "method_not_allowed" }, 405);
  }

  try {
    const matchdays = await db<Array<{
      id: string;
      slug: string;
      match_date: string;
      label: string;
      no_value: boolean;
      status: string;
      published_at: string | null;
    }>>(
      "maurilio_matchdays?select=id,slug,match_date,label,no_value,status,published_at&status=eq.published&order=published_at.desc&limit=1",
    );

    const active = matchdays[0] ?? null;
    const risk = await riskSnapshot();

    if (!active) {
      return response({
        mode: "off_market",
        status: "OFF MARKET",
        label: "Sin Matchday publicado",
        matchday: null,
        free: null,
        premium: { pro: false, elite: false },
        risk,
        updatedAt: new Date().toISOString(),
      });
    }

    if (active.no_value) {
      return response({
        mode: "no_value",
        status: "NO VALUE",
        label: active.label,
        matchday: {
          slug: active.slug,
          matchDate: active.match_date,
          publishedAt: active.published_at,
        },
        free: null,
        premium: { pro: false, elite: false },
        risk,
        updatedAt: new Date().toISOString(),
      });
    }

    const picks = await db<Array<Record<string, unknown>>>(
      `maurilio_picks?select=public_id,tier,sport,competition,event,market,selection,bookmaker,entry_odds,minimum_odds,probability_own,probability_low,probability_high,stake_pct,stake_ars,thesis,principal_risk,odds_captured_at,event_start_at,sale_status,sale_closed_reason,published_at&matchday_id=eq.${active.id}&status=eq.published&order=published_at.asc`,
    );

    const freePick = picks.find((pick) => pick.tier === "free") ?? null;
    const pro = picks.some((pick) => pick.tier === "pro");
    const elite = picks.some((pick) => pick.tier === "elite");

    return response({
      mode: "matchday",
      status: "MATCHDAY LIVE",
      label: active.label,
      matchday: {
        slug: active.slug,
        matchDate: active.match_date,
        publishedAt: active.published_at,
      },
      free: freePick,
      premium: { pro, elite },
      risk,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("maurilio_public_state_failed", error);
    return response({ error: "state_unavailable" }, 503);
  }
});
