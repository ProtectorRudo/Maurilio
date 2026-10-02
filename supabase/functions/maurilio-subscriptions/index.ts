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

function marketplaceConfig() {
  const clientId = Deno.env.get("MERCADOPAGO_CLIENT_ID")?.trim();
  const clientSecret = Deno.env.get("MERCADOPAGO_CLIENT_SECRET")?.trim();
  const encryptionSecret = Deno.env.get("MAURILIO_TOKEN_ENCRYPTION_KEY")?.trim();

  if (!clientId || !clientSecret || !encryptionSecret) return null;

  return {
    clientId,
    clientSecret,
    encryptionSecret,
  };
}

function platformFeeBps() {
  const value = Number(Deno.env.get("MAURILIO_PLATFORM_FEE_BPS"));
  return Number.isInteger(value) && value > 0 && value <= 5000 ? value : null;
}

function paymentsConfigured() {
  return Boolean(
    Deno.env.get("MAURILIO_SPLIT_PAYMENTS_ENABLED") === "1" &&
    marketplaceConfig() &&
    Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET") &&
    platformFeeBps(),
  );
}

function siteUrl() {
  return (Deno.env.get("MAURILIO_SITE_URL") || "https://viralio.net/maurilio")
    .replace(/\/$/, "");
}

function webhookUrl() {
  const { url } = config();
  return `${url}/functions/v1/maurilio-subscription-webhook`;
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

function bytesToBase64(bytes: Uint8Array) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
}

function base64ToBytes(value: string) {
  const raw = atob(value);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function encryptionKey(secret: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );

  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptValue(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(secret);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );

  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function decryptValue(value: string, secret: string) {
  const [version, ivPart, cipherPart] = value.split(".");
  if (version !== "v1" || !ivPart || !cipherPart) {
    throw new Error("encrypted_value_invalid");
  }

  const key = await encryptionKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivPart) },
    key,
    base64ToBytes(cipherPart),
  );

  return new TextDecoder().decode(decrypted);
}

type PaymentAccount = {
  tipster_id: string;
  provider_user_id: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string;
  token_expires_at: string | null;
  revoked_at: string | null;
};

async function paymentAccountForTipster(tipsterId: string) {
  const rows = await db<PaymentAccount[]>(
    `maurilio_tipster_payment_accounts?select=tipster_id,provider_user_id,access_token_ciphertext,refresh_token_ciphertext,token_expires_at,revoked_at&tipster_id=eq.${encodeURIComponent(tipsterId)}&revoked_at=is.null&limit=1`,
  );
  return rows[0] ?? null;
}

async function refreshSellerToken(account: PaymentAccount) {
  const mp = marketplaceConfig();
  if (!mp) throw new Error("marketplace_payments_not_configured");

  const refreshToken = await decryptValue(
    account.refresh_token_ciphertext,
    mp.encryptionSecret,
  );

  const response = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: mp.clientId,
      client_secret: mp.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    console.error("mercadopago_refresh_failed", response.status, payload);
    throw new Error("seller_payment_account_reconnect_required");
  }

  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token : "";
  const nextRefresh =
    typeof payload.refresh_token === "string" ? payload.refresh_token : "";

  if (!accessToken || !nextRefresh) {
    throw new Error("seller_payment_account_reconnect_required");
  }

  const expiresIn = Number(payload.expires_in);
  const safeExpiresIn =
    Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 15552000;

  await db(
    `maurilio_tipster_payment_accounts?tipster_id=eq.${encodeURIComponent(account.tipster_id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        access_token_ciphertext: await encryptValue(
          accessToken,
          mp.encryptionSecret,
        ),
        refresh_token_ciphertext: await encryptValue(
          nextRefresh,
          mp.encryptionSecret,
        ),
        token_expires_at: new Date(Date.now() + safeExpiresIn * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }),
    },
    "return=minimal",
  );

  return accessToken;
}

async function sellerAccessToken(account: PaymentAccount) {
  const mp = marketplaceConfig();
  if (!mp) throw new Error("marketplace_payments_not_configured");

  const expiresAt = account.token_expires_at
    ? new Date(account.token_expires_at).getTime()
    : 0;

  if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 7 * 24 * 60 * 60 * 1000) {
    return decryptValue(account.access_token_ciphertext, mp.encryptionSecret);
  }

  return refreshSellerToken(account);
}

function feeAmount(amount: number, feeBps: number) {
  return Math.round((amount * feeBps / 10000) * 100) / 100;
}

async function createPreference(input: {
  accessToken: string;
  tipsterId: string;
  tipsterName: string;
  collectorId: string;
  email: string;
  amount: number;
  marketplaceFee: number;
  reference: string;
  attemptId: string;
  subscriptionId: string;
}) {
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      items: [{
        id: `maurilio-${input.tipsterId}`,
        title: `Maurilio · ${input.tipsterName} · 30 días`,
        quantity: 1,
        currency_id: "ARS",
        unit_price: input.amount,
      }],
      payer: { email: input.email },
      marketplace_fee: input.marketplaceFee,
      external_reference: input.reference,
      notification_url: webhookUrl(),
      back_urls: {
        success: `${siteUrl()}/suscripciones?pago=aprobado`,
        pending: `${siteUrl()}/suscripciones?pago=pendiente`,
        failure: `${siteUrl()}/suscripciones?pago=fallido`,
      },
      auto_return: "approved",
      metadata: {
        maurilio_subscription_id: input.subscriptionId,
        maurilio_checkout_attempt_id: input.attemptId,
      },
    }),
  });

  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    payload = {};
  }

  const id = typeof payload.id === "string" ? payload.id : "";
  const initPoint =
    typeof payload.init_point === "string" ? payload.init_point : "";
  const collectorId =
    payload.collector_id !== undefined ? String(payload.collector_id) : "";

  if (!response.ok || !id || !initPoint || !collectorId) {
    console.error("mercadopago_split_preference_failed", response.status, payload);
    throw new Error("mercadopago_split_preference_failed");
  }

  if (collectorId !== input.collectorId) {
    throw new Error("mercadopago_collector_mismatch");
  }

  return {
    id,
    initPoint,
    collectorId,
    dateCreated:
      typeof payload.date_created === "string" ? payload.date_created : null,
  };
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

async function patchAttempt(id: string, patch: Record<string, unknown>) {
  await db(
    `maurilio_subscription_checkout_attempts?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    },
    "return=minimal",
  );
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return reply({ error: "method_not_allowed" }, 405);
  }

  try {
    const body = await request.json() as {
      action?: unknown;
      tipsterSlug?: unknown;
      subscriptionId?: unknown;
    };
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "status") {
      return reply({
        configured: paymentsConfigured(),
        provider: "mercado_pago",
        mode: "split_1_1",
        renewalMode: "manual",
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

    if (action === "cancel") {
      const subscriptionId =
        typeof body.subscriptionId === "string"
          ? body.subscriptionId.trim()
          : "";

      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          subscriptionId,
        )
      ) {
        return reply({ error: "invalid_subscription" }, 400);
      }

      const rows = await db<Array<{
        id: string;
        renewal_mode: string;
        status: string;
        current_period_end: string | null;
      }>>(
        `maurilio_tipster_subscriptions?select=id,renewal_mode,status,current_period_end&id=eq.${encodeURIComponent(subscriptionId)}&subscriber_user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
      );

      const subscription = rows[0];
      if (!subscription) {
        return reply({ error: "subscription_not_found" }, 404);
      }

      if (subscription.renewal_mode === "manual") {
        return reply({
          ok: true,
          status: subscription.status,
          accessUntil: subscription.current_period_end,
          renewalMode: "manual",
          message: "manual_renewal_does_not_require_cancellation",
        });
      }

      return reply({ error: "legacy_subscription_management_unavailable" }, 409);
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

    const account = await paymentAccountForTipster(tipster.id);
    if (!account) {
      return reply({ error: "tipster_payment_account_required" }, 409);
    }

    const feeBps = platformFeeBps();
    if (!feeBps) {
      return reply({ error: "platform_fee_not_configured" }, 503);
    }

    const marketplaceFee = feeAmount(amount, feeBps);
    if (marketplaceFee <= 0 || marketplaceFee >= amount) {
      return reply({ error: "invalid_platform_fee" }, 503);
    }

    const existing = await db<Array<{
      id: string;
      status: string;
      renewal_mode: string;
      current_period_end: string | null;
      monthly_price_ars: number | string;
      platform_fee_bps: number | null;
    }>>(
      `maurilio_tipster_subscriptions?select=id,status,renewal_mode,current_period_end,monthly_price_ars,platform_fee_bps&subscriber_user_id=eq.${encodeURIComponent(user.id)}&tipster_id=eq.${encodeURIComponent(tipster.id)}&status=in.(pending,active,past_due,paused)&order=created_at.desc&limit=1`,
    );

    let subscription = existing[0] ?? null;
    let createdNew = false;

    if (subscription && subscription.renewal_mode !== "manual") {
      return reply({ error: "legacy_subscription_requires_migration" }, 409);
    }

    if (!subscription) {
      const inserted = await db<Array<{
        id: string;
        status: string;
        renewal_mode: string;
        current_period_end: string | null;
        monthly_price_ars: number | string;
        platform_fee_bps: number | null;
      }>>(
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
            renewal_mode: "manual",
            provider_collector_id: account.provider_user_id,
            access_period_days: 30,
            provider_payload: {},
          }),
        },
        "return=representation",
      );

      subscription = inserted[0] ?? null;
      createdNew = true;
    } else {
      const frozenAmount = Number(subscription.monthly_price_ars);
      const frozenFeeBps = Number(subscription.platform_fee_bps);

      if (
        !Number.isFinite(frozenAmount) ||
        frozenAmount <= 0 ||
        !Number.isInteger(frozenFeeBps) ||
        frozenFeeBps <= 0
      ) {
        return reply({ error: "subscription_pricing_invalid" }, 409);
      }

      // Existing access keeps the price and platform fee frozen for that subscription.
      if (Math.round(frozenAmount * 100) !== Math.round(amount * 100)) {
        return reply({ error: "subscription_price_changed_create_new_required" }, 409);
      }
    }

    if (!subscription) {
      throw new Error("subscription_insert_failed");
    }

    const recentAttempts = await db<Array<{
      id: string;
      status: string;
      provider_payload: Record<string, unknown>;
      created_at: string;
    }>>(
      `maurilio_subscription_checkout_attempts?select=id,status,provider_payload,created_at&subscription_id=eq.${encodeURIComponent(subscription.id)}&status=eq.pending&order=created_at.desc&limit=1`,
    );

    const recent = recentAttempts[0];
    if (recent) {
      const createdAt = new Date(recent.created_at).getTime();
      const initPoint = recent.provider_payload?.init_point;
      if (
        Number.isFinite(createdAt) &&
        createdAt > Date.now() - 24 * 60 * 60 * 1000 &&
        typeof initPoint === "string" &&
        /^https:\/\//i.test(initPoint)
      ) {
        return reply({
          subscriptionId: subscription.id,
          checkoutUrl: initPoint,
          reused: true,
          renewalMode: "manual",
        });
      }
    }

    const attemptId = crypto.randomUUID();
    const reference = `maurilio_access_${subscription.id}_${attemptId}`;

    await db(
      "maurilio_subscription_checkout_attempts",
      {
        method: "POST",
        body: JSON.stringify({
          id: attemptId,
          subscription_id: subscription.id,
          external_reference: reference,
          provider_collector_id: account.provider_user_id,
          gross_amount_ars: amount,
          platform_fee_bps: feeBps,
          marketplace_fee_ars: marketplaceFee,
          status: "pending",
          provider_payload: {},
        }),
      },
      "return=minimal",
    );

    try {
      const token = await sellerAccessToken(account);
      const preference = await createPreference({
        accessToken: token,
        tipsterId: tipster.id,
        tipsterName: tipster.display_name,
        collectorId: account.provider_user_id,
        email: user.email,
        amount,
        marketplaceFee,
        reference,
        attemptId,
        subscriptionId: subscription.id,
      });

      await patchAttempt(attemptId, {
        provider_checkout_id: preference.id,
        provider_payload: {
          id: preference.id,
          init_point: preference.initPoint,
          collector_id: preference.collectorId,
          date_created: preference.dateCreated,
        },
      });

      await patchSubscription(subscription.id, {
        provider_checkout_id: preference.id,
        provider_collector_id: preference.collectorId,
        external_reference: reference,
        provider_payload: {
          checkout_mode: "split_1_1",
          latest_preference_id: preference.id,
          latest_attempt_id: attemptId,
        },
      });

      return reply({
        subscriptionId: subscription.id,
        checkoutId: preference.id,
        checkoutUrl: preference.initPoint,
        renewalMode: "manual",
        accessDays: 30,
        marketplaceFeeArs: marketplaceFee,
      });
    } catch (error) {
      await patchAttempt(attemptId, {
        status: "cancelled",
        provider_payload: {
          error: error instanceof Error ? error.message : "unknown",
        },
      }).catch(() => {});

      if (createdNew) {
        await patchSubscription(subscription.id, {
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
        }).catch(() => {});
      }

      throw error;
    }
  } catch (error) {
    console.error("maurilio_subscriptions_failed", error);
    const message = error instanceof Error ? error.message : "";

    if (message === "seller_payment_account_reconnect_required") {
      return reply({ error: message }, 409);
    }

    return reply({ error: "subscriptions_unavailable" }, 503);
  }
});
