import { createHmac, timingSafeEqual } from "node:crypto";

export type MercadoPagoOrder = {
  id?: string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  total_amount?: string | number;
  checkout_url?: string;
  live_mode?: boolean;
  [key: string]: unknown;
};

export function mercadoPagoConfigured() {
  return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);
}

export function mercadoPagoWebhookConfigured() {
  return Boolean(process.env.MERCADOPAGO_WEBHOOK_SECRET);
}

function accessToken() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("mercadopago_not_configured");
  return token;
}

async function parseProviderResponse(response: Response) {
  const text = await response.text();
  let body: MercadoPagoOrder & { message?: string } = {};
  if (text) {
    try {
      body = JSON.parse(text) as MercadoPagoOrder & { message?: string };
    } catch {
      body = { message: text.slice(0, 300) };
    }
  }
  return body;
}

export async function createMercadoPagoOrder(input: {
  externalReference: string;
  amount: number;
  tier: "pro" | "elite";
  siteUrl: string;
}) {
  const amount = input.amount.toFixed(2);
  const title =
    input.tier === "elite"
      ? "Maurilio — High Conviction"
      : "Maurilio — Análisis PRO";

  const response = await fetch("https://api.mercadopago.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken()}`,
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
      items: [
        {
          title,
          quantity: 1,
          unit_measure: "unit",
          unit_price: amount,
          total_amount: amount,
        },
      ],
      config: {
        online: {
          success_url: `${input.siteUrl}/access/success?tier=${input.tier}`,
          pending_url: `${input.siteUrl}/access/pending?tier=${input.tier}`,
          failure_url: `${input.siteUrl}/access/failure?tier=${input.tier}`,
        },
      },
    }),
    cache: "no-store",
  });

  const body = await parseProviderResponse(response);
  if (!response.ok || !body.id || !body.checkout_url) {
    console.error("Mercado Pago create order failed", {
      status: response.status,
      message: body.message,
    });
    throw new Error("mercadopago_create_order_failed");
  }
  return body;
}

export async function getMercadoPagoOrder(orderId: string) {
  const response = await fetch(
    `https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken()}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );

  const body = await parseProviderResponse(response);
  if (!response.ok || !body.id) {
    console.error("Mercado Pago get order failed", {
      status: response.status,
      orderId,
      message: body.message,
    });
    throw new Error("mercadopago_get_order_failed");
  }
  return body;
}

export function mapProviderOrderStatus(order: MercadoPagoOrder) {
  const status = String(order.status ?? "");
  const detail = String(order.status_detail ?? "");

  if (status === "processed" && detail === "accredited") return "paid" as const;
  if (status === "processed" && detail === "partially_refunded") return "paid" as const;
  if (status === "processed" && detail === "refunded") return "refunded" as const;
  if (status === "refunded") return "refunded" as const;
  if (status === "canceled") return "cancelled" as const;
  if (status === "failed") return "failed" as const;
  if (status === "processing" || status === "action_required") return "pending" as const;
  return "created" as const;
}

function normalise(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function validateMercadoPagoWebhookSignature(input: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}) {
  const signature = normalise(input.xSignature);
  const requestId = normalise(input.xRequestId);
  const dataId = normalise(input.dataId);
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;

  if (!signature || !secret) return false;

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
  if (dataId) manifestParts.push(`id:${dataId}`);
  if (requestId) manifestParts.push(`request-id:${requestId}`);
  manifestParts.push(`ts:${timestamp}`);
  const manifest = manifestParts.join(";") + ";";

  const computed = createHmac("sha256", secret).update(manifest).digest("hex");
  const computedBuffer = Buffer.from(computed);
  const receivedBuffer = Buffer.from(received);

  if (computedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(computedBuffer, receivedBuffer);
}
