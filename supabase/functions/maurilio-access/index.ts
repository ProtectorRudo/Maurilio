import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Json = Record<string, unknown> | Array<unknown>;

type Tier = "pro" | "elite";

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
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

async function db<T>(
  path: string,
  options: RequestInit = {},
  prefer?: string,
): Promise<T> {
  const { url, key } = config();
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
    console.error("maurilio_access_db_failed", {
      path,
      status: response.status,
      body: raw.slice(0, 240),
    });
    throw new Error(`db_failed_${response.status}`);
  }

  return raw ? JSON.parse(raw) as T : undefined as T;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function tier(value: unknown): Tier | null {
  return value === "pro" || value === "elite" ? value : null;
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function latestPublishedMatchday() {
  const rows = await db<Array<{
    id: string;
    slug: string;
    match_date: string;
    label: string;
    status: string;
    no_value: boolean;
    published_at: string | null;
  }>>(
    "maurilio_matchdays?select=id,slug,match_date,label,status,no_value,published_at&status=eq.published&order=published_at.desc&limit=1",
  );
  return rows[0] ?? null;
}

async function activeEntitlements(subjectId: string) {
  const rows = await db<Array<{
    id: string;
    matchday_slug: string;
    tier: Tier;
    status: string;
    granted_at: string;
    expires_at: string | null;
  }>>(
    `maurilio_entitlements?select=id,matchday_slug,tier,status,granted_at,expires_at&subject_id=eq.${encodeURIComponent(subjectId)}&status=eq.active&order=granted_at.desc&limit=100`,
  );
  const now = Date.now();
  return rows.filter((row) =>
    !row.expires_at || new Date(row.expires_at).getTime() > now
  );
}

async function hasEntitlement(
  subjectId: string,
  matchdaySlug: string,
  requestedTier: Tier,
) {
  const rows = await db<Array<{ id: string; expires_at: string | null }>>(
    `maurilio_entitlements?select=id,expires_at&subject_id=eq.${encodeURIComponent(subjectId)}&matchday_slug=eq.${encodeURIComponent(matchdaySlug)}&tier=eq.${requestedTier}&status=eq.active&limit=1`,
  );
  const row = rows[0];
  if (!row) return false;
  return !row.expires_at || new Date(row.expires_at).getTime() > Date.now();
}

async function matchdayBySlug(slug: string) {
  const rows = await db<Array<{
    id: string;
    slug: string;
    match_date: string;
    label: string;
    status: string;
  }>>(
    `maurilio_matchdays?select=id,slug,match_date,label,status&slug=eq.${encodeURIComponent(slug)}&limit=1`,
  );
  return rows[0] ?? null;
}

async function pickByTier(matchdayId: string, requestedTier: Tier) {
  const rows = await db<Array<Record<string, unknown>>>(
    `maurilio_picks?select=public_id,tier,sport,competition,event,market,selection,bookmaker,entry_odds,minimum_odds,probability_own,probability_low,probability_high,stake_pct,stake_ars,thesis,principal_risk,odds_captured_at,event_start_at,sale_status,sale_closed_reason,last_observed_odds,last_observed_at,status,result,closing_odds,pnl_ars,settled_at,published_at&matchday_id=eq.${encodeURIComponent(matchdayId)}&tier=eq.${requestedTier}&status=in.(published,settled)&order=published_at.desc&limit=1`,
  );
  return rows[0] ?? null;
}

function normaliseRecoveryCode(input: string) {
  const compact = input
    .trim()
    .toUpperCase()
    .replace(/^MB[-\s]?/, "")
    .replace(/[-\s]/g, "");

  return /^[A-F0-9]{40}$/.test(compact) ? compact : null;
}

async function sha256Hex(input: string) {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function recoveryHash(normalized: string) {
  return sha256Hex(`maurilio-access-recovery:${normalized}`);
}

async function accessTag(subjectId: string) {
  const hash = await sha256Hex(`maurilio-access-tag:${subjectId}`);
  return hash.slice(0, 10).toUpperCase();
}

function createRecoveryCode() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  const groups = raw.match(/.{1,5}/g) ?? [raw];
  return `MB-${groups.join("-")}`;
}

async function statusView(subjectId: string) {
  const matchday = await latestPublishedMatchday();
  const entitlements = await activeEntitlements(subjectId);

  if (!matchday) {
    return {
      matchday: null,
      pro: false,
      elite: false,
      activeEntitlements: entitlements.length,
    };
  }

  return {
    matchday: matchday.slug,
    pro: entitlements.some(
      (item) => item.matchday_slug === matchday.slug && item.tier === "pro",
    ),
    elite: entitlements.some(
      (item) => item.matchday_slug === matchday.slug && item.tier === "elite",
    ),
    activeEntitlements: entitlements.length,
  };
}

async function libraryView(subjectId: string) {
  const entitlements = await activeEntitlements(subjectId);
  const slugs = [...new Set(entitlements.map((item) => item.matchday_slug))];

  const matchdays = await Promise.all(
    slugs.map(async (slug) => [slug, await matchdayBySlug(slug)] as const),
  );
  const bySlug = new Map(matchdays);

  return {
    reports: entitlements.map((item) => {
      const matchday = bySlug.get(item.matchday_slug);
      return {
        id: item.id,
        tier: item.tier,
        matchday: item.matchday_slug,
        label: matchday?.label ?? item.matchday_slug,
        matchDate: matchday?.match_date ?? null,
        status: matchday?.status ?? "unknown",
        grantedAt: item.granted_at,
        expiresAt: item.expires_at,
      };
    }),
  };
}

async function reportView(
  subjectId: string,
  requestedTier: Tier,
  requestedMatchday?: string,
) {
  const matchday = requestedMatchday
    ? await matchdayBySlug(requestedMatchday)
    : await latestPublishedMatchday();

  if (!matchday) return reply({ error: "report_not_found" }, 404);

  const entitled = await hasEntitlement(
    subjectId,
    matchday.slug,
    requestedTier,
  );
  if (!entitled) return reply({ error: "access_required" }, 403);

  const pick = await pickByTier(matchday.id, requestedTier);
  if (!pick) return reply({ error: "report_not_published" }, 404);

  const entry = numeric(pick.entry_odds);
  const own = numeric(pick.probability_own);
  const low = numeric(pick.probability_low);
  const high = numeric(pick.probability_high);
  const implied = entry ? 1 / entry : null;
  const edge = own !== null && implied !== null ? own - implied : null;
  const ev = own !== null && entry !== null ? own * entry - 1 : null;

  return reply({
    report: {
      ...pick,
      matchday: {
        slug: matchday.slug,
        label: matchday.label,
        matchDate: matchday.match_date,
        status: matchday.status,
      },
      implied_probability: implied,
      edge,
      ev,
      access_tag: await accessTag(subjectId),
    },
  });
}

async function issueRecovery(subjectId: string) {
  const code = createRecoveryCode();
  const normalized = normaliseRecoveryCode(code);
  if (!normalized) return reply({ error: "recovery_unavailable" }, 503);

  try {
    const issued = await db<{
      issued_at: string;
      expires_at: string;
    }>(
      "rpc/maurilio_issue_recovery_code",
      {
        method: "POST",
        body: JSON.stringify({
          p_subject_id: subjectId,
          p_token_hash: await recoveryHash(normalized),
        }),
      },
    );

    return reply({
      code,
      expiresAt: issued.expires_at,
    });
  } catch {
    return reply({ error: "recovery_unavailable" }, 409);
  }
}

async function redeemRecovery(code: string) {
  const normalized = normaliseRecoveryCode(code);
  if (!normalized) return reply({ error: "invalid_code" }, 400);

  try {
    const recovered = await db<{
      subject_id: string;
      active_entitlements: number;
    }>(
      "rpc/maurilio_consume_recovery_code",
      {
        method: "POST",
        body: JSON.stringify({
          p_token_hash: await recoveryHash(normalized),
        }),
      },
    );

    if (!isUuid(recovered.subject_id)) {
      throw new Error("invalid_recovery_subject");
    }

    return reply({
      ok: true,
      subjectId: recovered.subject_id,
      activeEntitlements: recovered.active_entitlements,
    });
  } catch {
    return reply({ error: "invalid_or_expired_code" }, 403);
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return reply({ error: "method_not_allowed" }, 405);
  }

  try {
    const body = await request.json() as {
      action?: unknown;
      subjectId?: unknown;
      tier?: unknown;
      matchday?: unknown;
      code?: unknown;
    };

    if (body.action === "recover") {
      if (typeof body.code !== "string") {
        return reply({ error: "invalid_code" }, 400);
      }
      return redeemRecovery(body.code);
    }

    if (!isUuid(body.subjectId)) {
      return reply({ error: "access_required" }, 403);
    }

    if (body.action === "status") {
      return reply(await statusView(body.subjectId));
    }

    if (body.action === "library") {
      return reply(await libraryView(body.subjectId));
    }

    if (body.action === "issue_recovery") {
      return issueRecovery(body.subjectId);
    }

    if (body.action === "report") {
      const requestedTier = tier(body.tier);
      if (!requestedTier) return reply({ error: "invalid_tier" }, 400);
      const requestedMatchday =
        typeof body.matchday === "string" && body.matchday.trim()
          ? body.matchday.trim()
          : undefined;
      return reportView(body.subjectId, requestedTier, requestedMatchday);
    }

    return reply({ error: "invalid_action" }, 400);
  } catch (error) {
    console.error("maurilio_access_failed", error);
    return reply({ error: "access_unavailable" }, 503);
  }
});
