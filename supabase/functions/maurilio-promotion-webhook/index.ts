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
    console.error("promotion_webhook_db_failed", path, response.status, raw.slice(0, 300));
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

  const parts: Record<string, string> = {};
  for (const piece of signature.split(",")) {
    const separator = piece.indexOf("=");
    if (separator === -1) continue;
    const key = piece.slice(0, separator).trim().toLowerCase();
    const value = piece.slice(separator + 1).trim();
    if (key && value) parts[key] = value;
  }

  const timestamp = parts.ts;
  const received = parts.v1;
  if (!timestamp || !/^\d+$/.test(timestamp) || !received) return false;

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

  return constantTimeEqual(hex(signed), received.toLowerCase());
}

async function providerOrder(orderId: string) {
  const token = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  if (!token) throw new Error("mercadopago_not_configured");

  const response = await fetch(
    `https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    },
  );

  const raw = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    body = {};
  }
  if (!response.ok) throw new Error("mercadopago_order_lookup_failed");
  return body;
}

function paid(order: Record<string, unknown>) {
  return String(order.status || "") === "processed" &&
    String(order.status_detail || "") === "accredited";
}

function terminalFailure(order: Record<string, unknown>) {
  const status = String(order.status || "");
  const detail = String(order.status_detail || "");
  return status === "failed" ||
    status === "cancelled" ||
    status === "canceled" ||
    status === "expired" ||
    detail === "refunded";
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

  if (!await validSignature({
    signature: request.headers.get("x-signature"),
    requestId,
    dataId,
  })) {
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
  const orderId =
    dataId || (data.id !== undefined ? String(data.id) : null);

  if (!orderId) return reply({ error: "missing_order_id" }, 400);

  try {
    const order = await providerOrder(orderId);
    const externalReference =
      typeof order.external_reference === "string"
        ? order.external_reference
        : null;

    let rows = await db<Array<Record<string, unknown>>>(
      `maurilio_tipster_promotions?select=*&provider_order_id=eq.${encodeURIComponent(orderId)}&limit=1`,
    );

    if (!rows[0] && externalReference) {
      rows = await db<Array<Record<string, unknown>>>(
        `maurilio_tipster_promotions?select=*&external_reference=eq.${encodeURIComponent(externalReference)}&limit=1`,
      );
    }

    const promo = rows[0];
    if (!promo) return reply({ ok: true });

    const amount = Number(order.total_amount);
    if (
      !externalReference ||
      externalReference !== promo.external_reference ||
      !Number.isFinite(amount) ||
      Math.round(amount * 100) !== Math.round(Number(promo.amount_ars) * 100)
    ) {
      throw new Error("promotion_integrity_mismatch");
    }

    if (paid(order)) {
      const active = await db<Array<{ ends_at: string | null }>>(
        `maurilio_tipster_promotions?select=ends_at&tipster_id=eq.${encodeURIComponent(String(promo.tipster_id))}&status=eq.active&ends_at=gt.${encodeURIComponent(new Date().toISOString())}&order=ends_at.desc&limit=1`,
      );

      const now = new Date();
      const existingEnd =
        active[0]?.ends_at ? new Date(active[0].ends_at) : null;
      const starts =
        existingEnd && existingEnd.getTime() > now.getTime()
          ? existingEnd
          : now;
      const ends = new Date(
        starts.getTime() + Number(promo.duration_days) * 24 * 60 * 60 * 1000,
      );

      await db(
        `maurilio_tipster_promotions?id=eq.${encodeURIComponent(String(promo.id))}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            provider_order_id: order.id,
            provider_payload: order,
            status: "active",
            starts_at: starts.toISOString(),
            ends_at: ends.toISOString(),
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        },
        "return=minimal",
      );
    } else if (terminalFailure(order)) {
      await db(
        `maurilio_tipster_promotions?id=eq.${encodeURIComponent(String(promo.id))}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            provider_payload: order,
            status: "cancelled",
            updated_at: new Date().toISOString(),
          }),
        },
        "return=minimal",
      );
    }

    return reply({ ok: true });
  } catch (error) {
    console.error("maurilio_promotion_webhook_failed", error);
    return reply({ error: "promotion_webhook_failed" }, 500);
  }
});
