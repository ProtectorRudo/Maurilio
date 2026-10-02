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
    console.error("promotion_db_failed", path, response.status, raw.slice(0, 300));
    throw new Error(`db_failed_${response.status}`);
  }
  return raw ? JSON.parse(raw) as T : undefined as T;
}

function jwtClaims(request: Request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7);
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function dailyPrice() {
  const value = Number(Deno.env.get("MAURILIO_PROMOTION_DAILY_PRICE_ARS"));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function siteUrl() {
  const raw = Deno.env.get("MAURILIO_SITE_URL")?.replace(/\/$/, "");
  return raw && /^https:\/\//i.test(raw) ? raw : "https://viralio.net/maurilio";
}

function enabled() {
  return Boolean(
    Deno.env.get("MAURILIO_PROMOTIONS_ENABLED") === "1" &&
    Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") &&
    Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET") &&
    dailyPrice(),
  );
}

async function createOrder(input: {
  reference: string;
  displayName: string;
  days: number;
  amount: number;
}) {
  const token = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  if (!token) throw new Error("mercadopago_not_configured");

  const title = `Maurilio · Promocionar ${input.displayName} · ${input.days} días`;
  const root = siteUrl();

  const response = await fetch("https://api.mercadopago.com/v1/orders", {
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
      total_amount: input.amount.toFixed(2),
      external_reference: input.reference,
      description: title,
      items: [{
        title,
        quantity: 1,
        unit_measure: "unit",
        unit_price: input.amount.toFixed(2),
        total_amount: input.amount.toFixed(2),
      }],
      config: {
        online: {
          success_url: `${root}/para-tipsters?publicidad=success`,
          pending_url: `${root}/para-tipsters?publicidad=pending`,
          failure_url: `${root}/para-tipsters?publicidad=failure`,
        },
      },
    }),
  });

  const raw = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    body = {};
  }

  if (
    !response.ok ||
    typeof body.id !== "string" ||
    typeof body.checkout_url !== "string"
  ) {
    console.error("promotion_order_failed", response.status, body);
    throw new Error("promotion_order_failed");
  }

  return body;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return reply({ error: "method_not_allowed" }, 405);
  }

  try {
    const claims = jwtClaims(request);
    const userId = typeof claims?.sub === "string" ? claims.sub : null;
    if (!userId) return reply({ error: "authentication_required" }, 401);

    const body = await request.json() as {
      action?: unknown;
      days?: unknown;
    };

    const action = typeof body.action === "string" ? body.action : "";

    if (action === "status") {
      return reply({
        configured: enabled(),
        provider: "mercado_pago",
        dailyPriceArs: dailyPrice(),
        allowedDays: [3, 7, 14, 30],
      });
    }

    if (action !== "create") {
      return reply({ error: "invalid_action" }, 400);
    }

    if (!enabled()) {
      return reply({ error: "promotions_disabled" }, 503);
    }

    const days = Number(body.days);
    if (![3, 7, 14, 30].includes(days)) {
      return reply({ error: "invalid_duration" }, 400);
    }

    const tipsters = await db<Array<{
      id: string;
      display_name: string;
      status: string;
    }>>(
      `maurilio_tipsters?select=id,display_name,status&owner_user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    );
    const tipster = tipsters[0];

    if (!tipster || tipster.status !== "published") {
      return reply({ error: "tipster_profile_required" }, 409);
    }

    const existing = await db<Array<{
      id: string;
      provider_order_id: string | null;
      provider_payload: Record<string, unknown>;
    }>>(
      `maurilio_tipster_promotions?select=id,provider_order_id,provider_payload&tipster_id=eq.${encodeURIComponent(tipster.id)}&status=eq.pending&order=created_at.desc&limit=1`,
    );

    if (existing[0]) {
      const checkoutUrl =
        existing[0].provider_payload &&
        typeof existing[0].provider_payload.checkout_url === "string"
          ? existing[0].provider_payload.checkout_url
          : null;

      if (checkoutUrl) {
        return reply({
          promotionId: existing[0].id,
          checkoutUrl,
          reused: true,
        });
      }

      return reply({ error: "promotion_initializing" }, 409);
    }

    const unit = dailyPrice()!;
    const amount = Number((unit * days).toFixed(2));
    const reference =
      `maurilio_promo_${tipster.id.slice(0, 8)}_${crypto.randomUUID()}`;

    const inserted = await db<Array<{ id: string }>>(
      "maurilio_tipster_promotions",
      {
        method: "POST",
        body: JSON.stringify({
          tipster_id: tipster.id,
          placement: "search_top",
          status: "pending",
          duration_days: days,
          amount_ars: amount,
          provider: "mercado_pago",
          priority: 0,
          external_reference: reference,
          provider_payload: {},
        }),
      },
      "return=representation",
    );

    const local = inserted[0];
    if (!local) throw new Error("promotion_insert_failed");

    try {
      const order = await createOrder({
        reference,
        displayName: tipster.display_name,
        days,
        amount,
      });

      await db(
        `maurilio_tipster_promotions?id=eq.${encodeURIComponent(local.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            provider_order_id: order.id,
            provider_payload: order,
            updated_at: new Date().toISOString(),
          }),
        },
        "return=minimal",
      );

      return reply({
        promotionId: local.id,
        checkoutUrl: order.checkout_url,
        amountArs: amount,
        days,
      });
    } catch (error) {
      await db(
        `maurilio_tipster_promotions?id=eq.${encodeURIComponent(local.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: "cancelled",
            updated_at: new Date().toISOString(),
          }),
        },
        "return=minimal",
      ).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    console.error("maurilio_promotion_checkout_failed", error);
    return reply({ error: "promotion_checkout_failed" }, 502);
  }
});
