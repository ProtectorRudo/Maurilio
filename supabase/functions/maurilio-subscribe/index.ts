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
    console.error("subscription_db_failed", path, response.status, raw.slice(0, 300));
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

function feeBps() {
  const value = Number(Deno.env.get("MAURILIO_PLATFORM_FEE_BPS"));
  return Number.isInteger(value) && value > 0 && value <= 5000 ? value : null;
}

function siteUrl() {
  const raw = Deno.env.get("MAURILIO_SITE_URL")?.replace(/\/$/, "");
  return raw && /^https:\/\//i.test(raw) ? raw : "https://viralio.net/maurilio";
}

function configured() {
  return Boolean(
    Deno.env.get("MAURILIO_SUBSCRIPTIONS_ENABLED") === "1" &&
    Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") &&
    Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET") &&
    feeBps(),
  );
}

async function createPreapproval(input: {
  externalReference: string;
  payerEmail: string;
  tipsterName: string;
  amount: number;
}) {
  const token = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  if (!token) throw new Error("mercadopago_not_configured");

  const response = await fetch("https://api.mercadopago.com/preapproval", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      reason: `Suscripción a ${input.tipsterName} en Maurilio`,
      external_reference: input.externalReference,
      payer_email: input.payerEmail,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: Number(input.amount.toFixed(2)),
        currency_id: "ARS",
      },
      back_url: `${siteUrl()}/suscripciones?estado=retorno`,
      status: "pending",
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
    typeof body.init_point !== "string"
  ) {
    console.error("mercadopago_preapproval_failed", response.status, body);
    throw new Error("mercadopago_preapproval_failed");
  }

  return body;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return reply({ error: "method_not_allowed" }, 405);
  }

  if (!configured()) {
    return reply({ error: "subscriptions_disabled" }, 503);
  }

  try {
    const claims = jwtClaims(request);
    const userId = typeof claims?.sub === "string" ? claims.sub : null;
    const email = typeof claims?.email === "string" ? claims.email : null;

    if (!userId || !email) {
      return reply({ error: "authentication_required" }, 401);
    }

    const body = await request.json() as { tipsterSlug?: unknown };
    const slug =
      typeof body.tipsterSlug === "string"
        ? body.tipsterSlug.trim().toLowerCase()
        : "";

    if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) {
      return reply({ error: "invalid_tipster" }, 400);
    }

    const tipsters = await db<Array<{
      id: string;
      owner_user_id: string | null;
      display_name: string;
      monthly_price_ars: number | string | null;
      accepting_subscribers: boolean;
      status: string;
    }>>(
      `maurilio_tipsters?select=id,owner_user_id,display_name,monthly_price_ars,accepting_subscribers,status&slug=eq.${encodeURIComponent(slug)}&limit=1`,
    );

    const tipster = tipsters[0];
    const amount = Number(tipster?.monthly_price_ars);

    if (
      !tipster ||
      tipster.status !== "published" ||
      !tipster.accepting_subscribers ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return reply({ error: "subscription_unavailable" }, 409);
    }

    if (tipster.owner_user_id === userId) {
      return reply({ error: "cannot_subscribe_to_self" }, 409);
    }

    const existing = await db<Array<{
      id: string;
      status: string;
      provider_subscription_id: string | null;
      provider_payload: Record<string, unknown>;
    }>>(
      `maurilio_tipster_subscriptions?select=id,status,provider_subscription_id,provider_payload&subscriber_user_id=eq.${encodeURIComponent(userId)}&tipster_id=eq.${encodeURIComponent(tipster.id)}&status=in.(pending,active,past_due,paused)&limit=1`,
    );

    if (existing[0]) {
      const row = existing[0];
      if (row.status === "active") {
        return reply({ error: "already_subscribed" }, 409);
      }

      const initPoint =
        row.provider_payload &&
        typeof row.provider_payload.init_point === "string"
          ? row.provider_payload.init_point
          : null;

      if (initPoint) {
        return reply({
          subscriptionId: row.id,
          checkoutUrl: initPoint,
          reused: true,
        });
      }

      return reply({ error: "subscription_initializing" }, 409);
    }

    const platformFeeBps = feeBps()!;
    const externalReference =
      `maurilio_sub_${tipster.id.slice(0,8)}_${crypto.randomUUID()}`;

    const inserted = await db<Array<{
      id: string;
    }>>(
      "maurilio_tipster_subscriptions",
      {
        method: "POST",
        body: JSON.stringify({
          subscriber_user_id: userId,
          tipster_id: tipster.id,
          status: "pending",
          monthly_price_ars: amount,
          provider: "mercado_pago",
          platform_fee_bps: platformFeeBps,
          external_reference: externalReference,
          provider_payload: {},
        }),
      },
      "return=representation",
    );

    const local = inserted[0];
    if (!local) throw new Error("subscription_insert_failed");

    try {
      const provider = await createPreapproval({
        externalReference,
        payerEmail: email,
        tipsterName: tipster.display_name,
        amount,
      });

      await db(
        `maurilio_tipster_subscriptions?id=eq.${encodeURIComponent(local.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            provider_subscription_id: provider.id,
            provider_payload: provider,
            updated_at: new Date().toISOString(),
          }),
        },
        "return=minimal",
      );

      return reply({
        subscriptionId: local.id,
        checkoutUrl: provider.init_point,
        grossAmountArs: amount,
        platformFeeBps,
      });
    } catch (error) {
      await db(
        `maurilio_tipster_subscriptions?id=eq.${encodeURIComponent(local.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: "expired",
            updated_at: new Date().toISOString(),
          }),
        },
        "return=minimal",
      ).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    console.error("maurilio_subscription_create_failed", error);
    return reply({ error: "subscription_create_failed" }, 502);
  }
});
