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
    console.error("subscription_webhook_db_failed", path, response.status, raw.slice(0, 300));
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

async function mp(path: string) {
  const token = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  if (!token) throw new Error("mercadopago_not_configured");

  const response = await fetch(`https://api.mercadopago.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const raw = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    body = {};
  }

  if (!response.ok) {
    console.error("subscription_webhook_mp_failed", path, response.status);
    throw new Error(`mercadopago_${response.status}`);
  }

  return body;
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

function localStatus(providerStatus: unknown) {
  const value = String(providerStatus || "").toLowerCase();
  if (value === "authorized" || value === "active") return "active";
  if (value === "paused") return "paused";
  if (value === "cancelled" || value === "canceled") return "cancelled";
  if (value === "pending") return "pending";
  return "pending";
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

async function subscriptionByProvider(providerId: string) {
  const rows = await db<Array<{
    id: string;
    monthly_price_ars: number | string;
    platform_fee_bps: number;
  }>>(
    `maurilio_tipster_subscriptions?select=id,monthly_price_ars,platform_fee_bps&provider_subscription_id=eq.${encodeURIComponent(providerId)}&limit=1`,
  );
  return rows[0] ?? null;
}

async function processPreapproval(providerId: string) {
  const provider = await mp(`/preapproval/${encodeURIComponent(providerId)}`);
  const local = await subscriptionByProvider(providerId);
  if (!local) return false;

  await patchSubscription(local.id, {
    status: localStatus(provider.status),
    provider_payload: provider,
    current_period_end:
      typeof provider.next_payment_date === "string"
        ? provider.next_payment_date
        : null,
  });

  return true;
}

async function processAuthorizedPayment(invoiceId: string) {
  const invoice = await mp(
    `/authorized_payments/${encodeURIComponent(invoiceId)}`,
  );

  const providerSubscriptionId =
    typeof invoice.preapproval_id === "string"
      ? invoice.preapproval_id
      : null;

  if (!providerSubscriptionId) return false;
  const local = await subscriptionByProvider(providerSubscriptionId);
  if (!local) return false;

  if (!sameMoney(local.monthly_price_ars, invoice.transaction_amount)) {
    throw new Error("subscription_amount_mismatch");
  }

  const payment =
    invoice.payment &&
    typeof invoice.payment === "object" &&
    !Array.isArray(invoice.payment)
      ? invoice.payment as Record<string, unknown>
      : {};

  const providerPaymentId =
    payment.id !== undefined ? String(payment.id) : String(invoice.id);
  const status = paymentStatus(payment.status ?? invoice.summarized);
  const paidAt =
    status === "approved"
      ? typeof invoice.debit_date === "string"
        ? invoice.debit_date
        : new Date().toISOString()
      : null;

  await db(
    "maurilio_subscription_payments?on_conflict=provider_payment_id",
    {
      method: "POST",
      body: JSON.stringify({
        subscription_id: local.id,
        provider_payment_id: providerPaymentId,
        provider_preapproval_id: providerSubscriptionId,
        status,
        gross_amount_ars: Number(invoice.transaction_amount),
        platform_fee_bps: local.platform_fee_bps,
        paid_at: paidAt,
        provider_payload: invoice,
        updated_at: new Date().toISOString(),
      }),
    },
    "resolution=merge-duplicates,return=minimal",
  );

  if (status === "approved") {
    await patchSubscription(local.id, {
      status: "active",
      last_payment_at: paidAt,
    });
  } else if (status === "rejected") {
    await patchSubscription(local.id, { status: "past_due" });
  } else if (status === "cancelled" || status === "refunded") {
    await patchSubscription(local.id, { status: "cancelled" });
  }

  return true;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

  if (
    !Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ||
    !Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET")
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
      payload: body,
    });

    let processed = false;

    if (objectId && type === "subscription_preapproval") {
      processed = await processPreapproval(objectId);
    } else if (objectId && type === "subscription_authorized_payment") {
      processed = await processAuthorizedPayment(objectId);
    } else {
      await patchEvent(eventId, {
        status: "ignored",
        processed_at: new Date().toISOString(),
      });
      return reply({ ok: true });
    }

    await patchEvent(eventId, {
      status: processed ? "processed" : "ignored",
      processed_at: new Date().toISOString(),
      ...(processed ? {} : { error_message: "local_subscription_not_found" }),
    });

    return reply({ ok: true });
  } catch (error) {
    console.error("maurilio_subscription_webhook_failed", eventId, error);
    try {
      await patchEvent(eventId, {
        status: "failed",
        error_message:
          error instanceof Error ? error.message.slice(0, 300) : "unknown",
        processed_at: new Date().toISOString(),
      });
    } catch {
      // Mercado Pago will retry because we return 500.
    }
    return reply({ error: "webhook_processing_failed" }, 500);
  }
});
