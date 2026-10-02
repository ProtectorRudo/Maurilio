import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Json = Record<string, unknown> | Array<unknown>;

const RESPONSE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function reply(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: RESPONSE_HEADERS,
  });
}

function apiBase() {
  return (Deno.env.get("ODDS_API_BASE_URL") || "https://api.odds-api.net/v1")
    .replace(/\/$/, "");
}

function apiKey() {
  return Deno.env.get("ODDS_API_KEY")?.trim() || null;
}

function configuredBookmaker() {
  return Deno.env.get("BET365_BOOKMAKER_KEY")?.trim() || "bet365ww";
}

function bounded(value: string | null, max: number) {
  return (value || "").trim().slice(0, max);
}

function validEventId(value: string) {
  return /^[A-Za-z0-9._:-]{1,120}$/.test(value);
}

function validSelectionKey(value: string) {
  return value.length > 0 && value.length <= 240 && !/[\r\n]/.test(value);
}

async function provider(path: string) {
  const key = apiKey();
  if (!key) throw new Error("feed_not_configured");

  const response = await fetch(`${apiBase()}${path}`, {
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
    body = { raw: raw.slice(0, 500) };
  }

  if (!response.ok) {
    console.error("maurilio_bet365_provider_failed", path, response.status);
    throw new Error(`provider_${response.status}`);
  }

  return body;
}

function bookmakerPresent(catalog: unknown, key: string) {
  if (!catalog || typeof catalog !== "object") return false;
  const rows =
    Array.isArray((catalog as { items?: unknown }).items)
      ? (catalog as { items: Array<Record<string, unknown>> }).items
      : Array.isArray(catalog)
        ? catalog as Array<Record<string, unknown>>
        : [];

  return rows.some((row) => {
    const candidate = String(
      row.bookmaker ?? row.key ?? row.name ?? "",
    ).toLowerCase();
    return candidate === key.toLowerCase();
  });
}

function eventHasBet365(item: Record<string, unknown>, key: string) {
  const bookmakers = item.bookmakers;

  if (bookmakers && typeof bookmakers === "object" && !Array.isArray(bookmakers)) {
    return Object.keys(bookmakers).some(
      (candidate) => candidate.toLowerCase() === key.toLowerCase(),
    );
  }

  if (Array.isArray(bookmakers)) {
    return bookmakers.some(
      (candidate) => String(candidate).toLowerCase() === key.toLowerCase(),
    );
  }

  return false;
}

Deno.serve(async (request) => {
  if (request.method !== "GET") {
    return reply({ error: "method_not_allowed" }, 405);
  }

  const url = new URL(request.url);
  const view = bounded(url.searchParams.get("view"), 30) || "status";
  const bookmakerKey = configuredBookmaker();
  const key = apiKey();

  if (view === "status") {
    if (!key) {
      return reply({
        configured: false,
        provider: "odds-api.net",
        bookmaker: "Bet365",
        bookmakerKey,
      });
    }

    try {
      const catalog = await provider("/bookmakers");
      return reply({
        configured: true,
        provider: "odds-api.net",
        bookmaker: "Bet365",
        bookmakerKey,
        bookmakerAvailable: bookmakerPresent(catalog, bookmakerKey),
      });
    } catch (error) {
      console.error("maurilio_bet365_status_failed", error);
      return reply({
        configured: true,
        provider: "odds-api.net",
        bookmaker: "Bet365",
        bookmakerKey,
        bookmakerAvailable: false,
      });
    }
  }

  if (!key) {
    return reply({ error: "bet365_feed_not_configured" }, 503);
  }

  try {
    if (view === "events") {
      const sport = bounded(url.searchParams.get("sport"), 60);
      const league = bounded(url.searchParams.get("league"), 90);
      const limit = Math.max(
        1,
        Math.min(Number(url.searchParams.get("limit") || 100), 200),
      );
      const now = Math.floor(Date.now() / 1000);
      const requestedFrom = Number(url.searchParams.get("start_from"));
      const requestedTo = Number(url.searchParams.get("start_to"));
      const startFrom = Number.isFinite(requestedFrom)
        ? Math.max(now - 300, Math.floor(requestedFrom))
        : now - 300;
      const startTo = Number.isFinite(requestedTo)
        ? Math.min(
            startFrom + 7 * 24 * 60 * 60,
            Math.max(startFrom + 60, Math.floor(requestedTo)),
          )
        : startFrom + 7 * 24 * 60 * 60;

      const query = new URLSearchParams({
        limit: String(limit),
        start_from: String(startFrom),
        start_to: String(startTo),
        include_bookmaker_ids: "true",
        not_started_only: "true",
      });

      if (sport) query.set("sport", sport);
      if (league) query.set("league", league);

      const data = await provider(`/events?${query.toString()}`);
      const object =
        data && typeof data === "object" && !Array.isArray(data)
          ? data as Record<string, unknown>
          : {};
      const items = Array.isArray(object.items)
        ? object.items.filter(
            (item): item is Record<string, unknown> =>
              Boolean(
                item &&
                  typeof item === "object" &&
                  !Array.isArray(item) &&
                  eventHasBet365(item as Record<string, unknown>, bookmakerKey),
              ),
          )
        : [];

      return reply({
        bookmaker: "Bet365",
        bookmakerKey,
        items,
        count: items.length,
        next_cursor: object.next_cursor ?? null,
      });
    }

    if (view === "odds") {
      const eventId = bounded(url.searchParams.get("event_id"), 120);
      if (!validEventId(eventId)) {
        return reply({ error: "invalid_event_id" }, 400);
      }

      const types = bounded(url.searchParams.get("types"), 200);
      const marketKeys = bounded(url.searchParams.get("market_keys"), 300);
      const periods = bounded(url.searchParams.get("periods"), 120);

      const query = new URLSearchParams({
        bookmakers: bookmakerKey,
        price_fields: "odds",
        include_source: "true",
      });
      if (types) query.set("types", types);
      if (marketKeys) query.set("market_keys", marketKeys);
      if (periods) query.set("periods", periods);

      const snapshot = await provider(
        `/events/${encodeURIComponent(eventId)}/odds/snapshot?${query.toString()}`,
      );

      return reply({
        bookmaker: "Bet365",
        bookmakerKey,
        eventId,
        snapshot,
      });
    }

    if (view === "history") {
      const eventId = bounded(url.searchParams.get("event_id"), 120);
      const selectionKey = bounded(
        url.searchParams.get("selection_key"),
        240,
      );

      if (!validEventId(eventId) || !validSelectionKey(selectionKey)) {
        return reply({ error: "invalid_history_request" }, 400);
      }

      const query = new URLSearchParams({
        selection_key: selectionKey,
        bookmakers: bookmakerKey,
        price_type: "odds",
        price_fields: "odds",
        include_source: "true",
      });

      const from = bounded(url.searchParams.get("from_ts"), 50);
      const to = bounded(url.searchParams.get("to_ts"), 50);
      if (from) query.set("from_ts", from);
      if (to) query.set("to_ts", to);

      const history = await provider(
        `/events/${encodeURIComponent(eventId)}/odds/history?${query.toString()}`,
      );

      return reply({
        bookmaker: "Bet365",
        bookmakerKey,
        eventId,
        selectionKey,
        history,
      });
    }

    if (view === "result") {
      const eventId = bounded(url.searchParams.get("event_id"), 120);
      if (!validEventId(eventId)) {
        return reply({ error: "invalid_event_id" }, 400);
      }

      const result = await provider(
        `/events/${encodeURIComponent(eventId)}/results`,
      );

      return reply({ eventId, result });
    }

    return reply({ error: "invalid_view" }, 400);
  } catch (error) {
    console.error("maurilio_bet365_failed", view, error);
    const message = error instanceof Error ? error.message : "unknown";
    const status = message === "feed_not_configured" ? 503 : 502;
    return reply({ error: "bet365_feed_unavailable" }, status);
  }
});
