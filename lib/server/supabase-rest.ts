type Json = Record<string, unknown> | Array<unknown>;

export type MaurilioMatchdayRow = {
  id: string;
  slug: string;
  match_date: string;
  label: string;
  status: "draft" | "published" | "settled" | "archived";
  no_value: boolean;
  published_at: string | null;
};

export type MaurilioPickRow = {
  id: string;
  matchday_id: string;
  public_id: string;
  tier: "free" | "pro" | "elite";
  sport: string;
  competition: string;
  event: string;
  market: string;
  selection: string | null;
  bookmaker: "Bet365";
  entry_odds: number | string | null;
  minimum_odds: number | string | null;
  probability_own: number | string | null;
  probability_low: number | string | null;
  probability_high: number | string | null;
  stake_pct: number | string | null;
  stake_ars: number | string | null;
  thesis: string | null;
  principal_risk: string | null;
  odds_captured_at: string | null;
  status: "draft" | "published" | "void" | "settled";
  published_at: string | null;
};

export type MaurilioOrderRow = {
  id: string;
  provider_order_id: string | null;
  external_reference: string;
  subject_id: string;
  matchday_slug: string;
  tier: "pro" | "elite";
  amount_ars: number | string;
  status: "created" | "pending" | "processed" | "paid" | "cancelled" | "refunded" | "failed";
  live_mode: boolean | null;
  checkout_url: string | null;
  provider_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
};

type RestOptions = {
  method?: "GET" | "POST" | "PATCH";
  query?: URLSearchParams;
  body?: Json;
  prefer?: string;
};

function databaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export function databaseConfigured() {
  return Boolean(databaseConfig());
}

export async function databaseReachable() {
  if (!databaseConfigured()) return false;
  try {
    const query = new URLSearchParams({ select: "id", limit: "1" });
    await rest("maurilio_matchdays", { query });
    return true;
  } catch {
    return false;
  }
}

async function requestJson<T>(
  path: string,
  options: RestOptions = {},
): Promise<T> {
  const config = databaseConfig();
  if (!config) throw new Error("database_not_configured");

  const query = options.query?.toString();
  const response = await fetch(
    `${config.url}/rest/v1/${path}${query ? `?${query}` : ""}`,
    {
      method: options.method ?? "GET",
      headers: {
        apikey: config.key,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.prefer ? { Prefer: options.prefer } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    },
  );

  const raw = await response.text();
  if (!response.ok) {
    console.error("Supabase REST request failed", {
      path,
      status: response.status,
      body: raw.slice(0, 500),
    });
    throw new Error(`database_request_failed_${response.status}`);
  }

  if (!raw) return undefined as T;
  return JSON.parse(raw) as T;
}

async function rest<T>(table: string, options: RestOptions = {}): Promise<T> {
  return requestJson<T>(table, options);
}

export async function insertOrder(input: {
  external_reference: string;
  subject_id: string;
  matchday_slug: string;
  tier: "pro" | "elite";
  amount_ars: number;
}) {
  const rows = await rest<MaurilioOrderRow[]>("maurilio_orders", {
    method: "POST",
    prefer: "return=representation",
    body: input,
  });
  if (!rows[0]) throw new Error("order_insert_failed");
  return rows[0];
}

export async function updateOrderByExternalReference(
  externalReference: string,
  patch: Record<string, unknown>,
) {
  const query = new URLSearchParams({
    external_reference: `eq.${externalReference}`,
  });
  await rest("maurilio_orders", {
    method: "PATCH",
    query,
    prefer: "return=minimal",
    body: {
      ...patch,
      updated_at: new Date().toISOString(),
    },
  });
}

export async function updateOrderById(
  id: string,
  patch: Record<string, unknown>,
) {
  const query = new URLSearchParams({ id: `eq.${id}` });
  await rest("maurilio_orders", {
    method: "PATCH",
    query,
    prefer: "return=minimal",
    body: {
      ...patch,
      updated_at: new Date().toISOString(),
    },
  });
}

export async function findOrderByProviderOrderId(providerOrderId: string) {
  const query = new URLSearchParams({
    select: "*",
    provider_order_id: `eq.${providerOrderId}`,
    limit: "1",
  });
  const rows = await rest<MaurilioOrderRow[]>("maurilio_orders", { query });
  return rows[0] ?? null;
}

export async function findOrderByExternalReference(externalReference: string) {
  const query = new URLSearchParams({
    select: "*",
    external_reference: `eq.${externalReference}`,
    limit: "1",
  });
  const rows = await rest<MaurilioOrderRow[]>("maurilio_orders", { query });
  return rows[0] ?? null;
}

export async function recordWebhookEvent(input: {
  provider_event_id: string;
  provider_order_id: string;
  action?: string;
  event_type?: string;
  request_id?: string;
  payload: Record<string, unknown>;
}) {
  const query = new URLSearchParams({ on_conflict: "provider_event_id" });
  await rest("maurilio_webhook_events", {
    method: "POST",
    query,
    prefer: "resolution=ignore-duplicates,return=minimal",
    body: input,
  });
}

export async function updateWebhookEvent(
  providerEventId: string,
  patch: Record<string, unknown>,
) {
  const query = new URLSearchParams({
    provider_event_id: `eq.${providerEventId}`,
  });
  await rest("maurilio_webhook_events", {
    method: "PATCH",
    query,
    prefer: "return=minimal",
    body: patch,
  });
}

export async function grantEntitlement(input: {
  subject_id: string;
  matchday_slug: string;
  tier: "pro" | "elite";
  source_order_id: string;
}) {
  const query = new URLSearchParams({
    on_conflict: "subject_id,matchday_slug,tier",
  });
  await rest("maurilio_entitlements", {
    method: "POST",
    query,
    prefer: "resolution=merge-duplicates,return=minimal",
    body: {
      ...input,
      status: "active",
      granted_at: new Date().toISOString(),
      revoked_at: null,
    },
  });
}

export async function revokeEntitlement(sourceOrderId: string) {
  const query = new URLSearchParams({
    source_order_id: `eq.${sourceOrderId}`,
  });
  await rest("maurilio_entitlements", {
    method: "PATCH",
    query,
    prefer: "return=minimal",
    body: {
      status: "revoked",
      revoked_at: new Date().toISOString(),
    },
  });
}

export async function hasActiveEntitlement(
  subjectId: string,
  matchdaySlug: string,
  tier: "pro" | "elite",
) {
  const query = new URLSearchParams({
    select: "id,expires_at",
    subject_id: `eq.${subjectId}`,
    matchday_slug: `eq.${matchdaySlug}`,
    tier: `eq.${tier}`,
    status: "eq.active",
    limit: "1",
  });
  const rows = await rest<Array<{ id: string; expires_at: string | null }>>(
    "maurilio_entitlements",
    { query },
  );
  const row = rows[0];
  if (!row) return false;
  return !row.expires_at || new Date(row.expires_at).getTime() > Date.now();
}


export async function getLatestPublishedMatchday() {
  const query = new URLSearchParams({
    select: "id,slug,match_date,label,status,no_value,published_at",
    status: "eq.published",
    order: "published_at.desc",
    limit: "1",
  });
  const rows = await rest<MaurilioMatchdayRow[]>("maurilio_matchdays", {
    query,
  });
  return rows[0] ?? null;
}

export async function getPublishedPickByTier(
  matchdaySlug: string,
  tier: "free" | "pro" | "elite",
) {
  const matchdayQuery = new URLSearchParams({
    select: "id",
    slug: `eq.${matchdaySlug}`,
    status: "eq.published",
    limit: "1",
  });
  const matchdays = await rest<Array<{ id: string }>>("maurilio_matchdays", {
    query: matchdayQuery,
  });
  const matchday = matchdays[0];
  if (!matchday) return null;

  const pickQuery = new URLSearchParams({
    select:
      "id,matchday_id,public_id,tier,sport,competition,event,market,selection,bookmaker,entry_odds,minimum_odds,probability_own,probability_low,probability_high,stake_pct,stake_ars,thesis,principal_risk,odds_captured_at,status,published_at",
    matchday_id: `eq.${matchday.id}`,
    tier: `eq.${tier}`,
    status: "eq.published",
    order: "published_at.desc",
    limit: "1",
  });
  const picks = await rest<MaurilioPickRow[]>("maurilio_picks", {
    query: pickQuery,
  });
  return picks[0] ?? null;
}


export type SettledLedgerRow = {
  public_id: string;
  event: string;
  market: string;
  entry_odds: number | string | null;
  closing_odds: number | string | null;
  probability_own: number | string | null;
  result: "win" | "loss" | "push" | "void" | null;
  pnl_ars: number | string | null;
  stake_ars: number | string | null;
  odds_captured_at: string | null;
  settled_at: string | null;
};

export async function getSettledLedger(limit = 100) {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 250);
  const query = new URLSearchParams({
    select:
      "public_id,event,market,entry_odds,closing_odds,probability_own,result,pnl_ars,stake_ars,odds_captured_at,settled_at",
    status: "eq.settled",
    order: "settled_at.desc",
    limit: String(safeLimit),
  });
  return rest<SettledLedgerRow[]>("maurilio_picks", { query });
}


export async function publishMatchdayBundle(payload: Record<string, unknown>) {
  return requestJson<string>("rpc/maurilio_publish_bundle", {
    method: "POST",
    body: { payload },
  });
}
