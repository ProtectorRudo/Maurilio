import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Json = Record<string, unknown> | Array<unknown>;

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
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
    console.error("maurilio_webhook_db_failed", path, res.status, raw.slice(0, 260));
    throw new Error(`db_failed_${res.status}`);
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
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}) {
  const secret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
  const signature = normalise(input.xSignature);
  if (!secret || !signature) return false;

  const hashes: Record<string, string> = {};
  let timestamp: string | undefined;

  for (const part of signature.split(",")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim().toLowerCase();
    const value = part.slice(separator + 1).trim();
    if (!key || !value) continue;
    if (key === "ts") timestamp = value;
    else if (/^v\d+$/.test(key)) hashes[key] = value;
  }

  const received = hashes.v1;
  if (!timestamp || !/^\d+$/.test(timestamp) || !received) return false;

  const manifestParts: string[] = [];
  const dataId = normalise(input.dataId);
  const requestId = normalise(input.xRequestId);
  if (dataId) manifestParts.push(`id:${dataId}`);
  if (requestId) manifestParts.push(`request-id:${requestId}`);
  manifestParts.push(`ts:${timestamp}`);
  const manifest = manifestParts.join(";") + ";";

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
    new TextEncoder().encode(manifest),
  );
  return constantTimeEqual(hex(signed), received.toLowerCase());
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

function sameMoney(a: unknown, b: unknown) {
  const left = Number(a);
  const right = Number(b);
  return Number.isFinite(left) &&
    Number.isFinite(right) &&
    Math.round(left * 100) === Math.round(right * 100);
}

async function providerOrder(orderId: string) {
  const token = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  if (!token) throw new Error("mercadopago_not_configured");

  const res = await fetch(
    `https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    },
  );

  const raw = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    body = {};
  }

  if (!res.ok || typeof body.id !== "string") {
    throw new Error("mercadopago_get_order_failed");
  }
  return body;
}

async function recordWebhook(input: Record<string, unknown>) {
  await db(
    "maurilio_webhook_events?on_conflict=provider_event_id",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    "resolution=ignore-duplicates,return=minimal",
  );
}

async function patchWebhook(eventId: string, patch: Record<string, unknown>) {
  await db(
    `maurilio_webhook_events?provider_event_id=eq.${encodeURIComponent(eventId)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
    "return=minimal",
  );
}

async function patchOrder(id: string, patch: Record<string, unknown>) {
  await db(
    `maurilio_orders?id=eq.${encodeURIComponent(id)}`,
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

async function grantEntitlement(order: {
  id: string;
  subject_id: string;
  matchday_slug: string;
  tier: string;
}) {
  await db(
    "maurilio_entitlements?on_conflict=subject_id,matchday_slug,tier",
    {
      method: "POST",
      body: JSON.stringify({
        subject_id: order.subject_id,
        matchday_slug: order.matchday_slug,
        tier: order.tier,
        source_order_id: order.id,
        status: "active",
        granted_at: new Date().toISOString(),
        revoked_at: null,
      }),
    },
    "resolution=merge-duplicates,return=minimal",
  );
}

async function revokeEntitlement(orderId: string) {
  await db(
    `maurilio_entitlements?source_order_id=eq.${encodeURIComponent(orderId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "revoked",
        revoked_at: new Date().toISOString(),
      }),
    },
    "return=minimal",
  );
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return response({ error: "method_not_allowed" }, 405);
  }

  if (!Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ||
      !Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET")) {
    return response({ error: "webhook_not_configured" }, 503);
  }

  const url = new URL(req.url);
  const dataId = url.searchParams.get("data.id");
  const requestId = req.headers.get("x-request-id");

  if (!await validSignature({
    xSignature: req.headers.get("x-signature"),
    xRequestId: requestId,
    dataId,
  })) {
    return response({ error: "invalid_signature" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return response({ error: "invalid_json" }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return response({ error: "invalid_json" }, 400);
  }

  const bodyData = body.data && typeof body.data === "object" && !Array.isArray(body.data)
    ? body.data as Record<string, unknown>
    : {};
  const bodyOrderId = typeof bodyData.id === "string" ? bodyData.id : null;
  const orderId = dataId || bodyOrderId;
  const eventId = body.id !== undefined
    ? String(body.id)
    : `${String(body.action ?? "order")}:${orderId ?? "unknown"}:${String(body.date_created ?? "unknown")}`;

  if (!orderId || (bodyOrderId && bodyOrderId !== orderId)) {
    return response({ error: "order_id_mismatch" }, 400);
  }

  try {
    await recordWebhook({
      provider_event_id: eventId,
      provider_order_id: orderId,
      action: typeof body.action === "string" ? body.action : null,
      event_type: typeof body.type === "string" ? body.type : null,
      request_id: requestId,
      payload: body,
    });

    if (typeof body.type === "string" && body.type !== "order") {
      await patchWebhook(eventId, {
        status: "ignored",
        processed_at: new Date().toISOString(),
      });
      return response({ ok: true });
    }

    const provider = await providerOrder(orderId);
    const externalReference =
      typeof provider.external_reference === "string"
        ? provider.external_reference
        : null;

    let rows = await db<Array<Record<string, unknown>>>(
      `maurilio_orders?select=*&provider_order_id=eq.${encodeURIComponent(orderId)}&limit=1`,
    );

    if (!rows[0] && externalReference) {
      rows = await db<Array<Record<string, unknown>>>(
        `maurilio_orders?select=*&external_reference=eq.${encodeURIComponent(externalReference)}&limit=1`,
      );
    }

    const local = rows[0];
    if (!local) {
      await patchWebhook(eventId, {
        status: "ignored",
        error_message: "local_order_not_found",
        processed_at: new Date().toISOString(),
      });
      return response({ ok: true });
    }

    if (!externalReference ||
        externalReference !== local.external_reference ||
        !sameMoney(local.amount_ars, provider.total_amount)) {
      await patchWebhook(eventId, {
        status: "failed",
        error_message: "order_integrity_mismatch",
        processed_at: new Date().toISOString(),
      });
      return response({ ok: true });
    }

    const status = mapStatus(provider);
    await patchOrder(String(local.id), {
      provider_order_id: provider.id,
      status,
      live_mode:
        typeof provider.live_mode === "boolean"
          ? provider.live_mode
          : local.live_mode,
      provider_payload: provider,
      ...(status === "paid" && !local.paid_at
        ? { paid_at: new Date().toISOString() }
        : {}),
    });

    if (status === "paid") {
      await grantEntitlement({
        id: String(local.id),
        subject_id: String(local.subject_id),
        matchday_slug: String(local.matchday_slug),
        tier: String(local.tier),
      });
    } else if (status === "refunded" ||
               status === "cancelled" ||
               status === "failed") {
      await revokeEntitlement(String(local.id));
    }

    await patchWebhook(eventId, {
      status: "processed",
      processed_at: new Date().toISOString(),
    });

    return response({ ok: true });
  } catch (error) {
    console.error("mercadopago_webhook_failed", eventId, orderId, error);
    try {
      await patchWebhook(eventId, {
        status: "failed",
        error_message:
          error instanceof Error ? error.message.slice(0, 300) : "unknown",
        processed_at: new Date().toISOString(),
      });
    } catch {
      // Provider will retry because the request returns 500.
    }
    return response({ error: "webhook_processing_failed" }, 500);
  }
});
