import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Tier = "pro" | "elite";
type Json = Record<string, unknown> | Array<unknown>;

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function response(body: Json, status = 200) {
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

  if (!url || !key) throw new Error("supabase_server_config_missing");
  return { url, key };
}

async function db<T>(
  path: string,
  options: RequestInit = {},
  prefer?: string,
): Promise<T> {
  const { url, key } = config();
  const res = await fetch(`${url}/rest/v1/${path}`, {
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

  const raw = await res.text();
  if (!res.ok) {
    console.error("maurilio_checkout_db_failed", path, res.status, raw.slice(0, 260));
    throw new Error(`db_failed_${res.status}`);
  }

  return raw ? JSON.parse(raw) as T : undefined as T;
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseTier(value: unknown): Tier | null {
  return value === "pro" || value === "elite" ? value : null;
}

function price(tier: Tier) {
  const raw = Deno.env.get(
    tier === "pro" ? "MAURILIO_PRO_PRICE_ARS" : "MAURILIO_ELITE_PRICE_ARS",
  );
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function siteUrl() {
  const raw = Deno.env.get("MAURILIO_SITE_URL")?.replace(/\/$/, "");
  return raw && /^https:\/\//i.test(raw) ? raw : "https://viralio.net/maurilio";
}

function configured() {
  return Boolean(
    Deno.env.get("MAURILIO_CHECKOUT_ENABLED") === "1" &&
    Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") &&
    price("pro") &&
    price("elite"),
  );
}

function saleOpen(pick: { sale_status: string; event_start_at: string | null }) {
  if (pick.sale_status !== "open" || !pick.event_start_at) return false;
  const starts = new Date(pick.event_start_at).getTime();
  return Number.isFinite(starts) && starts > Date.now();
}

async function latestMatchday() {
  const rows = await db<Array<{
    id: string;
    slug: string;
    no_value: boolean;
  }>>(
    "maurilio_matchdays?select=id,slug,no_value&status=eq.published&order=published_at.desc&limit=1",
  );
  return rows[0] ?? null;
}

async function tierPick(matchdayId: string, tier: Tier) {
  const rows = await db<Array<{
    public_id: string;
    sale_status: string;
    event_start_at: string | null;
  }>>(
    `maurilio_picks?select=public_id,sale_status,event_start_at&matchday_id=eq.${encodeURIComponent(matchdayId)}&tier=eq.${tier}&status=eq.published&order=published_at.desc&limit=1`,
  );
  return rows[0] ?? null;
}

async function hasEntitlement(subjectId: string, slug: string, tier: Tier) {
  const rows = await db<Array<{ expires_at: string | null }>>(
    `maurilio_entitlements?select=expires_at&subject_id=eq.${encodeURIComponent(subjectId)}&matchday_slug=eq.${encodeURIComponent(slug)}&tier=eq.${tier}&status=eq.active&limit=1`,
  );
  const row = rows[0];
  return Boolean(
    row && (!row.expires_at || new Date(row.expires_at).getTime() > Date.now()),
  );
}

async function reserveOrder(input: {
  externalReference: string;
  subjectId: string;
  slug: string;
  tier: Tier;
  amount: number;
}) {
  return db<{
    reused: boolean;
    id: string;
    external_reference: string;
    provider_order_id: string | null;
    checkout_url: string | null;
    status: string;
    amount_ars: number | string;
  }>("rpc/maurilio_reserve_order", {
    method: "POST",
    body: JSON.stringify({
      p_external_reference: input.externalReference,
      p_subject_id: input.subjectId,
      p_matchday_slug: input.slug,
      p_tier: input.tier,
      p_amount_ars: input.amount,
    }),
  });
}

async function patchOrder(externalReference: string, patch: Record<string, unknown>) {
  await db(
    `maurilio_orders?external_reference=eq.${encodeURIComponent(externalReference)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        ...patch,
        updated_at: new Date().toISOString(),
      }),
    },
    "return=minimal",
  );
}

function mapStatus(order: Record<string, unknown>) {
  const status = String(order.status ?? "");
  const detail = String(order.status_detail ?? "");

  if (status === "processed" && detail === "accredited") return "paid";
  if (status === "processed" && detail === "partially_refunded") return "paid";
  if (status === "processed" && detail === "refunded") return "refunded";
  if (status === "refunded") return "refunded";
  if (status === "canceled") return "cancelled";
  if (status === "failed") return "failed";
  if (status === "processing" || status === "action_required") return "pending";
  return "created";
}

async function createProviderOrder(input: {
  externalReference: string;
  amount: number;
  tier: Tier;
}) {
  const token = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  if (!token) throw new Error("mercadopago_not_configured");

  const amount = input.amount.toFixed(2);
  const title =
    input.tier === "elite"
      ? "Maurilio — High Conviction"
      : "Maurilio — Análisis PRO";
  const root = siteUrl();

  const res = await fetch("https://api.mercadopago.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      type: "online",
      processing_mode: "manual",
      total_amount: amount,
      external_reference: input.externalReference,
      description: title,
      items: [{
        title,
        quantity: 1,
        unit_measure: "unit",
        unit_price: amount,
        total_amount: amount,
      }],
      config: {
        online: {
          success_url: `${root}/pago/success?tier=${input.tier}`,
          pending_url: `${root}/pago/pending?tier=${input.tier}`,
          failure_url: `${root}/pago/failure?tier=${input.tier}`,
        },
      },
    }),
  });

  const raw = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    body = { message: raw.slice(0, 300) };
  }

  if (!res.ok || typeof body.id !== "string" || typeof body.checkout_url !== "string") {
    console.error("mercadopago_create_order_failed", res.status, body.message);
    throw new Error("mercadopago_create_order_failed");
  }

  return body;
}

async function statusView() {
  let availability = { pro: false, elite: false };
  const active = await latestMatchday().catch(() => null);

  if (active && !active.no_value) {
    const [pro, elite] = await Promise.all([
      tierPick(active.id, "pro").catch(() => null),
      tierPick(active.id, "elite").catch(() => null),
    ]);
    availability = {
      pro: Boolean(pro && saleOpen(pro)),
      elite: Boolean(elite && saleOpen(elite)),
    };
  }

  return {
    enabled: configured(),
    provider: "mercado_pago",
    prices: {
      pro: price("pro"),
      elite: price("elite"),
    },
    availability,
    saleEndsAt: {
      pro: pro?.event_start_at ?? null,
      elite: elite?.event_start_at ?? null,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return response({ error: "method_not_allowed" }, 405);
  }

  try {
    const body = await req.json() as {
      action?: unknown;
      subjectId?: unknown;
      tier?: unknown;
    };

    if (body.action === "status") {
      return response(await statusView());
    }

    if (body.action !== "checkout") {
      return response({ error: "invalid_action" }, 400);
    }

    if (!configured()) {
      return response({ error: "checkout_disabled" }, 503);
    }

    if (!validUuid(body.subjectId)) {
      return response({ error: "invalid_subject" }, 400);
    }

    const requestedTier = parseTier(body.tier);
    if (!requestedTier) {
      return response({ error: "invalid_tier" }, 400);
    }

    const amount = price(requestedTier);
    if (!amount) {
      return response({ error: "price_not_configured" }, 503);
    }

    const matchday = await latestMatchday();
    if (!matchday || matchday.no_value) {
      return response({ error: "no_active_matchday" }, 409);
    }

    const pick = await tierPick(matchday.id, requestedTier);
    if (!pick) {
      return response({ error: "tier_not_available" }, 409);
    }

    if (pick.sale_status !== "open") {
      return response({ error: "sale_closed" }, 409);
    }

    if (!saleOpen(pick)) {
      return response({ error: "event_started" }, 409);
    }

    if (await hasEntitlement(body.subjectId, matchday.slug, requestedTier)) {
      return response({ error: "already_unlocked" }, 409);
    }

    const externalReference =
      `maurilio_${matchday.slug}_${requestedTier}_${crypto.randomUUID()}`;

    let reservedReference = externalReference;

    try {
      const reservation = await reserveOrder({
        externalReference,
        subjectId: body.subjectId,
        slug: matchday.slug,
        tier: requestedTier,
        amount,
      });

      reservedReference = reservation.external_reference;

      if (reservation.reused) {
        if (reservation.checkout_url && reservation.provider_order_id) {
          return response({
            orderId: reservation.provider_order_id,
            checkoutUrl: reservation.checkout_url,
            reused: true,
          });
        }

        return response({ error: "checkout_initializing" }, 409);
      }

      const order = await createProviderOrder({
        externalReference: reservedReference,
        amount,
        tier: requestedTier,
      });

      await patchOrder(reservedReference, {
        provider_order_id: order.id,
        status: mapStatus(order),
        checkout_url: order.checkout_url,
        live_mode:
          typeof order.live_mode === "boolean" ? order.live_mode : null,
        provider_payload: order,
      });

      return response({
        orderId: order.id,
        checkoutUrl: order.checkout_url,
      });
    } catch (error) {
      console.error("checkout_initialization_failed", reservedReference, error);
      try {
        await patchOrder(reservedReference, { status: "failed" });
      } catch {
        // Fail closed.
      }
      return response({ error: "checkout_initialization_failed" }, 502);
    }
  } catch (error) {
    console.error("maurilio_checkout_failed", error);
    return response({ error: "checkout_unavailable" }, 503);
  }
});
