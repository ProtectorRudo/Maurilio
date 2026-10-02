import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Json = Record<string, unknown> | Array<unknown>;

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function reply(body: Json, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
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
    console.error("subscriber_feed_db_failed", path, response.status, raw.slice(0, 300));
    throw new Error(`db_failed_${response.status}`);
  }
  return raw ? JSON.parse(raw) as T : undefined as T;
}

async function authUser(request: Request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;

  const { url } = config();
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!anon) throw new Error("anon_key_missing");

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: auth },
  });
  if (!response.ok) return null;

  const body = await response.json() as { id?: string };
  return typeof body.id === "string" ? body.id : null;
}

Deno.serve(async (request) => {
  if (request.method !== "GET") return reply({ error: "method_not_allowed" }, 405);

  try {
    const userId = await authUser(request);
    if (!userId) return reply({ error: "authentication_required" }, 401);

    const subscriptions = await db<Array<{
      tipster_id: string;
      status: string;
      current_period_end: string | null;
    }>>(
      `maurilio_tipster_subscriptions?select=tipster_id,status,current_period_end&subscriber_user_id=eq.${encodeURIComponent(userId)}&status=eq.active&limit=200`,
    );

    const activeTipsterIds = subscriptions
      .filter((subscription) => {
        if (!subscription.current_period_end) return true;
        const end = new Date(subscription.current_period_end).getTime();
        return Number.isFinite(end) && end > Date.now();
      })
      .map((subscription) => subscription.tipster_id);

    if (activeTipsterIds.length === 0) {
      return reply({ tips: [] });
    }

    const orFilter = activeTipsterIds
      .map((id) => `tipster_id.eq.${encodeURIComponent(id)}`)
      .join(",");

    const tips = await db<Array<Record<string, unknown>>>(
      `maurilio_tipster_tips?select=public_id,tipster_id,sport,competition,event,market,selection,bookmaker,entry_odds,stake_units,event_start_at,published_at,content_hash,odds_captured_at&status=eq.published&event_start_at=gt.${encodeURIComponent(new Date().toISOString())}&or=(${orFilter})&order=event_start_at.asc&limit=500`,
    );

    const tipsters = await db<Array<Record<string, unknown>>>(
      `maurilio_tipsters?select=id,slug,display_name,avatar_url&or=(${activeTipsterIds
        .map((id) => `id.eq.${encodeURIComponent(id)}`)
        .join(",")})`,
    );

    const byId = new Map(
      tipsters.map((tipster) => [String(tipster.id), tipster]),
    );

    return reply({
      tips: tips.map((tip) => ({
        ...tip,
        tipster: byId.get(String(tip.tipster_id)) ?? null,
      })),
    });
  } catch (error) {
    console.error("maurilio_subscriber_feed_failed", error);
    return reply({ error: "subscriber_feed_unavailable" }, 503);
  }
});
