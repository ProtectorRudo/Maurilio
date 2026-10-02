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

function serverConfig() {
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

async function db<T>(
  path: string,
  options: RequestInit = {},
  prefer?: string,
): Promise<T> {
  const { url, key } = serverConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
      ...(options.headers || {}),
    },
  });

  const raw = await response.text();
  if (!response.ok) {
    console.error("tip_publish_db_failed", path, response.status, raw.slice(0, 300));
    throw new Error(`db_failed_${response.status}`);
  }

  return raw ? JSON.parse(raw) as T : undefined as T;
}

async function authenticatedUser(request: Request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;

  const { url } = serverConfig();
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!anon) throw new Error("anon_key_missing");

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anon,
      Authorization: auth,
    },
  });

  if (!response.ok) return null;
  const body = await response.json() as { id?: string };
  return typeof body.id === "string" ? body.id : null;
}

function oddsBase() {
  return (Deno.env.get("ODDS_API_BASE_URL") || "https://api.odds-api.net/v1")
    .replace(/\/$/, "");
}

function oddsKey() {
  return Deno.env.get("ODDS_API_KEY")?.trim() || null;
}

function bookmakerKey() {
  return Deno.env.get("BET365_BOOKMAKER_KEY")?.trim() || "bet365ww";
}

async function oddsProvider(path: string) {
  const key = oddsKey();
  if (!key) throw new Error("bet365_feed_not_configured");

  const response = await fetch(`${oddsBase()}${path}`, {
    headers: {
      "X-API-Key": key,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(8000),
  });

  const raw = await response.text();
  let body: unknown = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }

  if (!response.ok) {
    console.error("tip_publish_provider_failed", path, response.status);
    throw new Error(`provider_${response.status}`);
  }

  return body;
}

function findLine(node: unknown, selectionKey: string, depth = 0): Record<string, unknown> | null {
  if (depth > 9 || node === null || node === undefined) return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findLine(item, selectionKey, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof node !== "object") return null;
  const row = node as Record<string, unknown>;

  if (row.selection_key === selectionKey) {
    const price = Number(row.odds ?? row.price);
    if (Number.isFinite(price) && price > 1) return row;
  }

  for (const value of Object.values(row)) {
    if (value && typeof value === "object") {
      const found = findLine(value, selectionKey, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function deepValue(node: unknown, keys: string[], depth = 0): unknown {
  if (depth > 7 || node === null || node === undefined) return undefined;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = deepValue(item, keys, depth + 1);
      if (found !== undefined && found !== null && found !== "") return found;
    }
    return undefined;
  }

  if (typeof node !== "object") return undefined;
  const row = node as Record<string, unknown>;

  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }

  for (const value of Object.values(row)) {
    if (value && typeof value === "object") {
      const found = deepValue(value, keys, depth + 1);
      if (found !== undefined && found !== null && found !== "") return found;
    }
  }

  return undefined;
}

function eventStart(detail: unknown) {
  const raw = deepValue(detail, [
    "start_time",
    "startTime",
    "start_at",
    "event_start_at",
    "date",
  ]);

  if (typeof raw === "number" && Number.isFinite(raw)) {
    return new Date(raw > 10_000_000_000 ? raw : raw * 1000);
  }

  if (typeof raw === "string") {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      return new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000);
    }
  }

  return null;
}

function stringValue(detail: unknown, keys: string[], fallback: string) {
  const raw = deepValue(detail, keys);
  return typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
}

function lineString(line: Record<string, unknown>, keys: string[], fallback: string) {
  for (const key of keys) {
    const value = line[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function lineTimestamp(line: Record<string, unknown>) {
  for (const key of ["updated_at", "updatedAt", "captured_at", "capturedAt"]) {
    const value = line[key];
    if (typeof value === "string") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
  }
  return null;
}

function settleableRule(line: Record<string, unknown>) {
  const betType = String(line.bet_type ?? "").trim().toLowerCase();
  const marketKey = String(line.market_key ?? "").trim().toLowerCase();
  const periodRaw = line.period_str ?? line.period;
  const period =
    periodRaw === null || periodRaw === undefined
      ? ""
      : String(periodRaw).trim().toLowerCase();

  if (
    period &&
    !period.includes("full") &&
    !period.includes("match") &&
    !period.includes("game")
  ) {
    return null;
  }

  const family =
    betType === "moneyline" || marketKey === "moneyline" || marketKey === "moneyline 3w"
      ? "moneyline"
      : betType === "handicap" || marketKey === "handicap" || marketKey === "spread"
        ? "handicap"
        : betType === "total" || marketKey === "total" || marketKey === "over_under"
          ? "total"
          : null;

  if (!family) return null;

  const side = String(line.side ?? "").trim().toLowerCase();

  if (family === "moneyline") {
    return ["home", "away", "draw"].includes(side) ? family : null;
  }

  const threshold = Number(line.line);
  if (!Number.isFinite(threshold)) return null;

  if (family === "handicap") {
    return ["home", "away"].includes(side) ? family : null;
  }

  if (family === "total") {
    return ["over", "under"].includes(side) ? family : null;
  }

  return null;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return reply({ error: "method_not_allowed" }, 405);
  }

  try {
    const userId = await authenticatedUser(request);
    if (!userId) return reply({ error: "authentication_required" }, 401);

    const body = await request.json() as {
      eventId?: unknown;
      selectionKey?: unknown;
      stakeUnits?: unknown;
    };

    const eventId =
      typeof body.eventId === "string" ? body.eventId.trim() : "";
    const selectionKey =
      typeof body.selectionKey === "string" ? body.selectionKey.trim() : "";
    const stakeUnits = Number(body.stakeUnits);

    if (!/^[A-Za-z0-9._:-]{1,120}$/.test(eventId)) {
      return reply({ error: "invalid_event_id" }, 400);
    }
    if (!selectionKey || selectionKey.length > 240) {
      return reply({ error: "invalid_selection_key" }, 400);
    }
    if (!Number.isFinite(stakeUnits) || stakeUnits <= 0 || stakeUnits > 5) {
      return reply({ error: "invalid_stake" }, 400);
    }

    const accounts = await db<Array<{ role: string }>>(
      `maurilio_accounts?select=role&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    );
    const account = accounts[0];
    if (!account || (account.role !== "tipster" && account.role !== "admin")) {
      return reply({ error: "tipster_role_required" }, 403);
    }

    const tipsters = await db<Array<{
      id: string;
      status: string;
    }>>(
      `maurilio_tipsters?select=id,status&owner_user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    );
    const tipster = tipsters[0];
    if (!tipster || tipster.status !== "published") {
      return reply({ error: "tipster_profile_required" }, 409);
    }

    const bookmaker = bookmakerKey();

    const [detail, snapshot] = await Promise.all([
      oddsProvider(`/events/${encodeURIComponent(eventId)}?include_source=true&include_bookmaker_ids=true`),
      oddsProvider(
        `/events/${encodeURIComponent(eventId)}/odds/snapshot?bookmakers=${encodeURIComponent(bookmaker)}&price_fields=odds&include_source=true`,
      ),
    ]);

    const start = eventStart(detail);
    if (!start || start.getTime() <= Date.now()) {
      return reply({ error: "event_started" }, 409);
    }

    const line = findLine(snapshot, selectionKey);
    if (!line) {
      return reply({ error: "bet365_selection_unavailable" }, 409);
    }

    const entryOdds = Number(line.odds ?? line.price);
    if (!Number.isFinite(entryOdds) || entryOdds <= 1) {
      return reply({ error: "invalid_bet365_price" }, 409);
    }

    const settlementRule = settleableRule(line);
    if (!settlementRule) {
      return reply({ error: "market_not_auto_settleable" }, 409);
    }

    const sport = stringValue(detail, ["sport", "sport_name"], "Sport");
    const competition = stringValue(detail, ["league", "competition", "league_name"], "Competition");
    const home = stringValue(detail, ["home_team", "homeTeam", "home"], "Local");
    const away = stringValue(detail, ["away_team", "awayTeam", "away"], "Visitante");
    const market = lineString(line, ["market_key", "bet_type", "market"], "Mercado");
    const selection = lineString(
      line,
      ["selection_name", "selection", "side", "name"],
      selectionKey,
    );
    const capturedAt = new Date().toISOString();
    const publicId = `MT-${capturedAt.slice(0,10).replaceAll("-","")}-${crypto.randomUUID().slice(0,8).toUpperCase()}`;

    const inserted = await db<Array<Record<string, unknown>>>(
      "maurilio_tipster_tips",
      {
        method: "POST",
        body: JSON.stringify({
          tipster_id: tipster.id,
          public_id: publicId,
          sport,
          competition,
          event: `${home} vs ${away}`,
          market,
          selection,
          bookmaker: "Bet365",
          entry_odds: entryOdds,
          stake_units: stakeUnits,
          event_start_at: start.toISOString(),
          published_at: capturedAt,
          status: "published",
          provider_event_id: eventId,
          provider_selection_key: selectionKey,
          provider_market_key: market,
          provider_bookmaker_key: bookmaker,
          settlement_rule: settlementRule,
          odds_captured_at: capturedAt,
          provider_price_updated_at: lineTimestamp(line),
          provider_capture: {
            bookmaker: "Bet365",
            bookmakerKey: bookmaker,
            eventId,
            selectionKey,
            line,
          },
        }),
      },
      "return=representation",
    );

    const tip = inserted[0];
    if (!tip) throw new Error("insert_failed");

    return reply({
      ok: true,
      tip: {
        publicId: tip.public_id,
        event: tip.event,
        market: tip.market,
        selection: tip.selection,
        entryOdds: tip.entry_odds,
        stakeUnits: tip.stake_units,
        eventStartAt: tip.event_start_at,
        publishedAt: tip.published_at,
        contentHash: tip.content_hash,
      },
    });
  } catch (error) {
    console.error("maurilio_tip_publish_failed", error);
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "bet365_feed_not_configured") {
      return reply({ error: "bet365_feed_not_configured" }, 503);
    }
    return reply({ error: "tip_publish_unavailable" }, 503);
  }
});
