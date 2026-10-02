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
    console.error("subscriptions_db_failed", path, response.status, raw.slice(0, 300));
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

  const body = await response.json() as { id?: string; email?: string };
  if (typeof body.id !== "string" || typeof body.email !== "string") return null;
  return { id: body.id, email: body.email };
}

function platformFeeBps() {
  const value = Number(Deno.env.get("MAURILIO_PLATFORM_FEE_BPS"));
  return Number.isInteger(value) && value > 0 && value <= 5000 ? value : null;
}

function paymentsConfigured() {
  return Boolean(
    Deno.env.get("MAURILIO_SUBSCRIPTIONS_ENABLED") === "1" &&
    Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") &&
    Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET") &&
    platformFeeBps(),
  );
}

function siteUrl() {
  return (Deno.env.get("MAURILIO_SITE_URL") || "https://viralio.net/maurilio")
    .replace(/\/$/, "");
}

async function createPreapproval(input: {
  reason: string;
  reference: string;
  email: string;
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
      reason: input.reason,
      external_reference: input.reference,
      payer_email: input.email,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: input.amount,
        currency_id: "ARS",
      },
      back_url: `${siteUrl()}/suscripciones`,
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

async function patchSubscription(id: string, patch: Record<string, unknown>) {
  await db(
    `maurilio_tipster_subscriptions?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    },
    "return=minimal",
  );
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

  try {
    const body = await request.json() as {
      action?: unknown;
      tipsterSlug?: unknown;
    };
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "status") {
      return reply({
        configured: paymentsConfigured(),
        provider: "mercado_pago",
        platformFeeBps: platformFeeBps(),
      });
    }

    const user = await authUser(request);
    if (!user) return reply({ error: "authentication_required" }, 401);

    if (action === "list") {
      const subscriptions = await db<Array<Record<string, unknown>>>(
        `maurilio_tipster_subscriptions?select=*&subscriber_user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=100`,
      );

      const tipsterIds = [
        ...new Set(
          subscriptions
            .map((row) => row.tipster_id)
            .filter((value): value is string => typeof value === "string"),
        ),
      ];

      let tipsters: Array<Record<string, unknown>> = [];
      if (tipsterIds.length > 0) {
        const filter = tipsterIds.map(encodeURIComponent).join(",");
        tipsters = await db<Array<Record<string, unknown>>>(
          `maurilio_tipsters?select=id,slug,display_name,headline,avatar_url&or=(${tipsterIds
            .map((id) => `id.eq.${encodeURIComponent(id)}`)
            .join(",")})`,
        );
      }

      const byId = new Map(
        tipsters.map((tipster) => [String(tipster.id), tipster]),
      );

      return reply({
        subscriptions: subscriptions.map((row) => ({
          ...row,
          tipster: byId.get(String(row.tipster_id)) ?? null,
        })),
      });
    }

    if (action !== "create") {
      return reply({ error: "invalid_action" }, 400);
    }

    if (!paymentsConfigured()) {
      return reply({ error: "subscriptions_disabled" }, 503);
    }

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

    if (
      !tipster ||
      tipster.status !== "published" ||
      !tipster.accepting_subscribers
    ) {
      return reply({ error: "subscriptions_not_available" }, 409);
    }

    if (tipster.owner_user_id === user.id) {
      return reply({ error: "cannot_subscribe_to_self" }, 409);
    }

    const amount = Number(tipster.monthly_price_ars);
    if (!Number.isFinite(amount) || amount <= 0) {
      return reply({ error: "invalid_subscription_price" }, 409);
    }

    const existing = await db<Array<{
      id: string;
      provider_subscription_id: string | null;
      provider_payload: Record<string, unknown>;
      status: string;
    }>>(
      `maurilio_tipster_subscriptions?select=id,provider_subscription_id,provider_payload,status&subscriber_user_id=eq.${encodeURIComponent(user.id)}&tipster_id=eq.${encodeURIComponent(tipster.id)}&status=in.(pending,active,past_due,paused)&order=created_at.desc&limit=1`,
    );

    if (existing[0]) {
      const initPoint = existing[0].provider_payload?.init_point;
      if (existing[0].status === "pending" && typeof initPoint === "string") {
        return reply({
          subscriptionId: existing[0].id,
          checkoutUrl: initPoint,
          reused: true,
        });
      }
      return reply({ error: "subscription_already_exists" }, 409);
    }

    const feeBps = platformFeeBps();
    if (!feeBps) return reply({ error: "platform_fee_not_configured" }, 503);

    const reference = `maurilio_sub_${tipster.id}_${crypto.randomUUID()}`;

    const inserted = await db<Array<{ id: string }>>(
      "maurilio_tipster_subscriptions",
      {
        method: "POST",
        body: JSON.stringify({
          subscriber_user_id: user.id,
          tipster_id: tipster.id,
          status: "pending",
          monthly_price_ars: amount,
          platform_fee_bps: feeBps,
          provider: "mercado_pago",
          external_reference: reference,
          provider_payload: {},
        }),
      },
      "return=representation",
    );
    const local = inserted[0];
    if (!local) throw new Error("subscription_insert_failed");

    try {
      const preapproval = await createPreapproval({
        reason: `Maurilio · ${tipster.display_name}`,
        reference,
        email: user.email,
        amount,
      });

      await patchSubscription(local.id, {
        provider_subscription_id: preapproval.id,
        provider_payload: preapproval,
      });

      return reply({
        subscriptionId: local.id,
        providerSubscriptionId: preapproval.id,
        checkoutUrl: preapproval.init_point,
      });
    } catch (error) {
      await patchSubscription(local.id, { status: "cancelled" }).catch(() => {});
      throw error;
    }
  } catch (error) {
    console.error("maurilio_subscriptions_failed", error);
    return reply({ error: "subscriptions_unavailable" }, 503);
  }
});
