import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Json = Record<string, unknown> | Array<unknown>;

type PendingTip = {
  id: string;
  public_id: string;
  provider_event_id: string | null;
  provider_selection_key: string | null;
  provider_bookmaker_key: string;
  provider_capture: Record<string, unknown> | null;
  event_start_at: string;
  published_at: string;
  settlement_rule: "moneyline" | "handicap" | "total" | null;
};

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
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
    console.error("tip_settlement_db_failed", path, response.status, raw.slice(0, 300));
    throw new Error(`db_failed_${response.status}`);
  }

  return raw ? JSON.parse(raw) as T : undefined as T;
}

function oddsBase() {
  return (Deno.env.get("ODDS_API_BASE_URL") || "https://api.odds-api.net/v1")
    .replace(/\/$/, "");
}

function oddsKey() {
  return Deno.env.get("ODDS_API_KEY")?.trim() || null;
}

async function oddsProvider(path: string) {
  const key = oddsKey();
  if (!key) throw new Error("odds_feed_not_configured");

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
    throw new Error(`provider_${response.status}`);
  }

  return body;
}

function deepValue(node: unknown, keys: string[], depth = 0): unknown {
  if (depth > 8 || node === null || node === undefined) return undefined;

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

function score(node: unknown, keys: string[]) {
  const value = deepValue(node, keys);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resultStatus(node: unknown) {
  const raw = deepValue(node, ["status", "state", "result_status"]);
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function resultIsFinal(node: unknown) {
  const status = resultStatus(node);

  if (
    status.includes("pending") ||
    status.includes("live") ||
    status.includes("progress") ||
    status.includes("scheduled") ||
    status.includes("not_started")
  ) {
    return false;
  }

  return [
    "final",
    "finished",
    "complete",
    "completed",
    "settled",
    "available",
    "ended",
  ].some((token) => status.includes(token));
}

function lineFromCapture(capture: Record<string, unknown> | null) {
  if (!capture) return null;
  const line = capture.line;
  return line && typeof line === "object" && !Array.isArray(line)
    ? line as Record<string, unknown>
    : null;
}

function settle(
  rule: NonNullable<PendingTip["settlement_rule"]>,
  line: Record<string, unknown>,
  homeScore: number,
  awayScore: number,
) {
  const side = String(line.side ?? "").trim().toLowerCase();

  if (rule === "moneyline") {
    const winner =
      homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw";
    return side === winner ? "win" : "loss";
  }

  const threshold = Number(line.line);
  if (!Number.isFinite(threshold)) return null;

  if (rule === "handicap") {
    const adjusted =
      side === "home"
        ? homeScore + threshold - awayScore
        : side === "away"
          ? awayScore + threshold - homeScore
          : NaN;

    if (!Number.isFinite(adjusted)) return null;
    return adjusted > 0 ? "win" : adjusted < 0 ? "loss" : "push";
  }

  if (rule === "total") {
    const total = homeScore + awayScore;

    if (side === "over") {
      return total > threshold ? "win" : total < threshold ? "loss" : "push";
    }
    if (side === "under") {
      return total < threshold ? "win" : total > threshold ? "loss" : "push";
    }
  }

  return null;
}

async function closingPrice(tip: PendingTip) {
  if (!tip.provider_event_id || !tip.provider_selection_key) return null;

  const query = new URLSearchParams({
    selection_key: tip.provider_selection_key,
    bookmakers: tip.provider_bookmaker_key,
    from_ts: tip.published_at,
    to_ts: tip.event_start_at,
    price_type: "odds",
    price_fields: "odds",
    include_source: "true",
    limit_points_per_bookmaker: "250",
  });

  try {
    const history = await oddsProvider(
      `/events/${encodeURIComponent(tip.provider_event_id)}/odds/history?${query.toString()}`,
    );

    if (!history || typeof history !== "object" || Array.isArray(history)) {
      return null;
    }

    const series = (history as Record<string, unknown>).series;
    if (!Array.isArray(series)) return null;

    const cutoff = new Date(tip.event_start_at).getTime();
    let best: { odds: number; tickTs: string } | null = null;

    for (const item of series) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const points = (item as Record<string, unknown>).points;
      if (!Array.isArray(points)) continue;

      for (const point of points) {
        if (!point || typeof point !== "object" || Array.isArray(point)) continue;
        const row = point as Record<string, unknown>;
        if (row.is_available === false) continue;

        const tickTs =
          typeof row.tick_ts === "string" ? row.tick_ts : null;
        const odds = Number(row.odds);

        if (!tickTs || !Number.isFinite(odds) || odds <= 1) continue;

        const timestamp = new Date(tickTs).getTime();
        if (!Number.isFinite(timestamp) || timestamp > cutoff) continue;

        if (!best || timestamp > new Date(best.tickTs).getTime()) {
          best = { odds, tickTs };
        }
      }
    }

    return best;
  } catch (error) {
    console.warn("tip_closing_price_unavailable", tip.public_id, error);
    return null;
  }
}

async function authorized(request: Request) {
  const supplied = request.headers.get("x-maurilio-settlement-secret") || "";
  if (!supplied) return false;

  const verified = await db<boolean>(
    "rpc/maurilio_verify_settlement_secret",
    {
      method: "POST",
      body: JSON.stringify({ p_secret: supplied }),
    },
  );

  return verified === true;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return reply({ error: "method_not_allowed" }, 405);
  }

  try {
    if (!(await authorized(request))) {
      return reply({ error: "unauthorized" }, 401);
    }

    if (!oddsKey()) {
      return reply({ error: "odds_feed_not_configured" }, 503);
    }

    const now = new Date().toISOString();
    const tips = await db<PendingTip[]>(
      `maurilio_tipster_tips?select=id,public_id,provider_event_id,provider_selection_key,provider_bookmaker_key,provider_capture,event_start_at,published_at,settlement_rule&status=eq.published&event_start_at=lt.${encodeURIComponent(now)}&settlement_rule=not.is.null&order=event_start_at.asc&limit=40`,
    );

    let settledCount = 0;
    let pendingCount = 0;
    let skippedCount = 0;
    const errors: Array<{ publicId: string; error: string }> = [];

    for (const tip of tips) {
      if (!tip.provider_event_id || !tip.settlement_rule) {
        skippedCount += 1;
        continue;
      }

      try {
        const providerResult = await oddsProvider(
          `/events/${encodeURIComponent(tip.provider_event_id)}/results`,
        );

        if (!resultIsFinal(providerResult)) {
          pendingCount += 1;
          continue;
        }

        const homeScore = score(providerResult, [
          "home_score",
          "homeScore",
          "score_home",
          "home_points",
        ]);
        const awayScore = score(providerResult, [
          "away_score",
          "awayScore",
          "score_away",
          "away_points",
        ]);

        if (homeScore === null || awayScore === null) {
          pendingCount += 1;
          continue;
        }

        const line = lineFromCapture(tip.provider_capture);
        if (!line) {
          skippedCount += 1;
          continue;
        }

        const outcome = settle(
          tip.settlement_rule,
          line,
          homeScore,
          awayScore,
        );

        if (!outcome) {
          skippedCount += 1;
          continue;
        }

        const closing = await closingPrice(tip);
        const verifiedAt = new Date().toISOString();

        await db(
          `maurilio_tipster_tips?id=eq.${encodeURIComponent(tip.id)}&status=eq.published`,
          {
            method: "PATCH",
            body: JSON.stringify({
              status: "settled",
              result: outcome,
              closing_odds: closing?.odds ?? null,
              settled_at: verifiedAt,
              settlement_verified_at: verifiedAt,
              settlement_capture: {
                provider: "odds-api.net",
                providerEventId: tip.provider_event_id,
                homeScore,
                awayScore,
                resultStatus: resultStatus(providerResult),
                rule: tip.settlement_rule,
                line,
                closingPrice: closing,
                result: providerResult,
              },
              updated_at: verifiedAt,
            }),
          },
          "return=minimal",
        );

        settledCount += 1;
      } catch (error) {
        errors.push({
          publicId: tip.public_id,
          error: error instanceof Error ? error.message.slice(0, 160) : "unknown",
        });
      }
    }

    return reply({
      ok: true,
      checked: tips.length,
      settled: settledCount,
      pending: pendingCount,
      skipped: skippedCount,
      errors,
    });
  } catch (error) {
    console.error("maurilio_tip_settlement_failed", error);
    return reply({ error: "settlement_unavailable" }, 503);
  }
});
