import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Json = Record<string, unknown> | Array<unknown>;

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
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
  return { clientId, clientSecret, encryptionSecret };
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
    console.error("split_webhook_db_failed", path, response.status, raw.slice(0, 300));
    throw new Error(`db_failed_${response.status}`);
  }

  return raw ? JSON.parse(raw) as T : undefined as T;
}

function normalise(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function validSignature(input: {
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
}) {
  const secret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
  const signature = normalise(input.signature);
  if (!secret || !signature) return false;

  const hashes: Record<string, string> = {};
  let timestamp: string | undefined;

  for (const part of signature.split(",")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim().toLowerCase();
    const value = part.slice(separator + 1).trim();
    if (key === "ts") timestamp = value;
    else if (/^v\d+$/.test(key) && value) hashes[key] = value;
  }

  if (!timestamp || !/^\d+$/.test(timestamp) || !hashes.v1) return false;

  const manifest: string[] = [];
  const dataId = normalise(input.dataId);
  const requestId = normalise(input.requestId);
  if (dataId) manifest.push(`id:${dataId}`);
  if (requestId) manifest.push(`request-id:${requestId}`);
  manifest.push(`ts:${timestamp}`);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(manifest.join(";") + ";"),
  );

  return constantTimeEqual(hex(signed), hashes.v1.toLowerCase());
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
};

async function paymentAccountForCollector(collectorId: string) {
  const rows = await db<PaymentAccount[]>(
    `maurilio_tipster_payment_accounts?select=tipster_id,provider_user_id,access_token_ciphertext,refresh_token_ciphertext,token_expires_at&provider_user_id=eq.${encodeURIComponent(collectorId)}&revoked_at=is.null&limit=1`,
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
    console.error("split_webhook_refresh_failed", response.status, payload);
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

async function fetchPayment(paymentId: string, accessToken: string) {
  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  );

  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    console.error("split_webhook_payment_fetch_failed", response.status, payload);
    throw new Error(`mercadopago_payment_${response.status}`);
  }

  return payload;
}

function paymentStatus(value: unknown) {
  const status = String(value || "").toLowerCase();
  if (status === "approved") return "approved";
  if (status === "refunded" || status === "charged_back") return "refunded";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "rejected") return "rejected";
  return "pending";
}

function sameMoney(a: unknown, b: unknown) {
  const left = Number(a);
  const right = Number(b);
  return Number.isFinite(left) &&
    Number.isFinite(right) &&
    Math.round(left * 100) === Math.round(right * 100);
}

async function recordEvent(input: Record<string, unknown>) {
  await db(
    "maurilio_subscription_webhook_events?on_conflict=provider_event_id",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    "resolution=ignore-duplicates,return=minimal",
  );
}

async function patchEvent(id: string, patch: Record<string, unknown>) {
  await db(
    `maurilio_subscription_webhook_events?provider_event_id=eq.${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
    "return=minimal",
  );
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

async function claimAttempt(id: string, status: string) {
  return db<Array<{ id: string }>>(
    `maurilio_subscription_checkout_attempts?id=eq.${encodeURIComponent(id)}&status=eq.pending`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status,
        updated_at: new Date().toISOString(),
      }),
    },
    "return=representation",
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

  if (
    !Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET") ||
    !marketplaceConfig()
  ) {
    return reply({ error: "webhook_not_configured" }, 503);
  }

  const url = new URL(request.url);
  const dataId = url.searchParams.get("data.id");
  const requestId = request.headers.get("x-request-id");

  if (
    !await validSignature({
      signature: request.headers.get("x-signature"),
      requestId,
      dataId,
    })
  ) {
    return reply({ error: "invalid_signature" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return reply({ error: "invalid_json" }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return reply({ error: "invalid_json" }, 400);
  }

  const data =
    body.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? body.data as Record<string, unknown>
      : {};

  const objectId = dataId || (data.id !== undefined ? String(data.id) : null);
  const type = typeof body.type === "string" ? body.type : "";
  const collectorId =
    body.user_id !== undefined ? String(body.user_id) : null;
  const eventId =
    body.id !== undefined
      ? String(body.id)
      : `${type || "event"}:${objectId || "unknown"}:${String(body.date_created || "unknown")}`;

  try {
    await recordEvent({
      provider_event_id: eventId,
      event_type: type || null,
      action: typeof body.action === "string" ? body.action : null,
      provider_object_id: objectId,
      request_id: requestId,
      payload: {
        id: body.id ?? null,
        live_mode: body.live_mode ?? null,
        type,
        action: body.action ?? null,
        user_id: collectorId,
        data: objectId ? { id: objectId } : {},
        date_created: body.date_created ?? null,
      },
    });

    if (!objectId || type !== "payment" || !collectorId) {
      await patchEvent(eventId, {
        status: "ignored",
        processed_at: new Date().toISOString(),
      });
      return reply({ ok: true });
    }

    const account = await paymentAccountForCollector(collectorId);
    if (!account) {
      await patchEvent(eventId, {
        status: "ignored",
        error_message: "collector_not_connected",
        processed_at: new Date().toISOString(),
      });
      return reply({ ok: true });
    }

    const token = await sellerAccessToken(account);
    const payment = await fetchPayment(objectId, token);

    const paymentCollector =
      payment.collector_id !== undefined ? String(payment.collector_id) : "";
    if (paymentCollector !== collectorId) {
      throw new Error("payment_collector_mismatch");
    }

    const reference =
      typeof payment.external_reference === "string"
        ? payment.external_reference
        : "";

    if (!reference.startsWith("maurilio_access_")) {
      await patchEvent(eventId, {
        status: "ignored",
        error_message: "unrelated_payment",
        processed_at: new Date().toISOString(),
      });
      return reply({ ok: true });
    }

    const attempts = await db<Array<{
      id: string;
      subscription_id: string;
      provider_collector_id: string;
      gross_amount_ars: number | string;
      platform_fee_bps: number;
      marketplace_fee_ars: number | string;
      status: string;
    }>>(
      `maurilio_subscription_checkout_attempts?select=id,subscription_id,provider_collector_id,gross_amount_ars,platform_fee_bps,marketplace_fee_ars,status&external_reference=eq.${encodeURIComponent(reference)}&limit=1`,
    );
    const attempt = attempts[0];

    if (!attempt) {
      throw new Error("checkout_attempt_not_found");
    }

    if (attempt.provider_collector_id !== collectorId) {
      throw new Error("checkout_collector_mismatch");
    }

    if (!sameMoney(attempt.gross_amount_ars, payment.transaction_amount)) {
      throw new Error("payment_amount_mismatch");
    }

    const subscriptions = await db<Array<{
      id: string;
      status: string;
      current_period_end: string | null;
      access_period_days: number;
    }>>(
      `maurilio_tipster_subscriptions?select=id,status,current_period_end,access_period_days&id=eq.${encodeURIComponent(attempt.subscription_id)}&limit=1`,
    );
    const subscription = subscriptions[0];
    if (!subscription) {
      throw new Error("subscription_not_found");
    }

    const status = paymentStatus(payment.status);
    const paidAt =
      status === "approved" && typeof payment.date_approved === "string"
        ? payment.date_approved
        : status === "approved"
          ? new Date().toISOString()
          : null;

    const previousPayments = await db<Array<{ status: string }>>(
      `maurilio_subscription_payments?select=status&provider_payment_id=eq.${encodeURIComponent(objectId)}&limit=1`,
    );
    const previousStatus = previousPayments[0]?.status ?? null;

    await db(
      "maurilio_subscription_payments?on_conflict=provider_payment_id",
      {
        method: "POST",
        body: JSON.stringify({
          subscription_id: subscription.id,
          provider_payment_id: objectId,
          provider_preapproval_id: null,
          provider_collector_id: collectorId,
          status,
          gross_amount_ars: Number(payment.transaction_amount),
          platform_fee_bps: attempt.platform_fee_bps,
          provider_marketplace_fee_ars: Number(attempt.marketplace_fee_ars),
          paid_at: paidAt,
          provider_payload: {
            id: payment.id ?? objectId,
            status: payment.status ?? null,
            status_detail: payment.status_detail ?? null,
            transaction_amount: payment.transaction_amount ?? null,
            date_approved: payment.date_approved ?? null,
            collector_id: payment.collector_id ?? null,
            external_reference: reference,
            payment_method_id: payment.payment_method_id ?? null,
            payment_type_id: payment.payment_type_id ?? null,
            fee_details: Array.isArray(payment.fee_details)
              ? payment.fee_details
              : [],
          },
          updated_at: new Date().toISOString(),
        }),
      },
      "resolution=merge-duplicates,return=minimal",
    );

    if (status === "approved") {
      const claimed = await claimAttempt(attempt.id, "approved");

      if (claimed[0] && previousStatus !== "approved") {
        const days = Number(subscription.access_period_days);
        const safeDays =
          Number.isInteger(days) && days > 0 && days <= 366 ? days : 30;

        const end = new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000);

        await patchSubscription(subscription.id, {
          status: "active",
          current_period_end: end.toISOString(),
          last_payment_at: paidAt,
          cancelled_at: null,
          provider_collector_id: collectorId,
        });
      }
    } else if (status === "refunded" || status === "cancelled") {
      await patchAttempt(attempt.id, { status: "cancelled" });

      if (previousStatus === "approved" || attempt.status === "approved") {
        await patchSubscription(subscription.id, {
          status: "cancelled",
          current_period_end: new Date().toISOString(),
          cancelled_at: new Date().toISOString(),
        });
      }
    } else if (status === "rejected") {
      await claimAttempt(attempt.id, "rejected");

      if (subscription.status === "pending") {
        await patchSubscription(subscription.id, {
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
        });
      }
    }

    await patchEvent(eventId, {
      status: "processed",
      processed_at: new Date().toISOString(),
    });

    return reply({ ok: true });
  } catch (error) {
    console.error("maurilio_split_payment_webhook_failed", eventId, error);

    try {
      await patchEvent(eventId, {
        status: "failed",
        error_message:
          error instanceof Error ? error.message.slice(0, 300) : "unknown",
        processed_at: new Date().toISOString(),
      });
    } catch {
      // Mercado Pago retries non-2xx responses.
    }

    return reply({ error: "webhook_processing_failed" }, 500);
  }
});
