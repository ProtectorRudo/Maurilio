import { NextRequest, NextResponse } from "next/server";
import {
  databaseConfigured,
  findOrderByExternalReference,
  findOrderByProviderOrderId,
  grantEntitlement,
  recordWebhookEvent,
  revokeEntitlement,
  updateOrderById,
  updateWebhookEvent,
} from "@/lib/server/supabase-rest";
import {
  getMercadoPagoOrder,
  mapProviderOrderStatus,
  mercadoPagoConfigured,
  mercadoPagoWebhookConfigured,
  validateMercadoPagoWebhookSignature,
} from "@/lib/server/mercadopago";

export const runtime = "nodejs";

type WebhookBody = {
  id?: string | number;
  action?: string;
  type?: string;
  live_mode?: boolean;
  date_created?: string;
  data?: { id?: string };
  [key: string]: unknown;
};

function objectBody(value: unknown): value is WebhookBody {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sameMoney(a: number | string, b: number | string | undefined) {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.round(left * 100) === Math.round(right * 100);
}

export async function POST(request: NextRequest) {
  if (
    !databaseConfigured() ||
    !mercadoPagoConfigured() ||
    !mercadoPagoWebhookConfigured()
  ) {
    return NextResponse.json(
      { error: "webhook_not_configured" },
      { status: 503 },
    );
  }

  const dataId = request.nextUrl.searchParams.get("data.id");
  const requestId = request.headers.get("x-request-id");

  if (
    !validateMercadoPagoWebhookSignature({
      xSignature: request.headers.get("x-signature"),
      xRequestId: requestId,
      dataId,
    })
  ) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let body: WebhookBody;
  try {
    const parsed = (await request.json()) as unknown;
    if (!objectBody(parsed)) throw new Error("invalid_body");
    body = parsed;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const providerOrderId = dataId || body.data?.id;
  const providerEventId =
    body.id !== undefined
      ? String(body.id)
      : `${body.action ?? "order"}:${providerOrderId ?? "unknown"}:${body.date_created ?? "unknown"}`;

  if (!providerOrderId || (body.data?.id && body.data.id !== providerOrderId)) {
    return NextResponse.json({ error: "order_id_mismatch" }, { status: 400 });
  }

  try {
    await recordWebhookEvent({
      provider_event_id: providerEventId,
      provider_order_id: providerOrderId,
      action: typeof body.action === "string" ? body.action : undefined,
      event_type: typeof body.type === "string" ? body.type : undefined,
      request_id: requestId ?? undefined,
      payload: body,
    });

    if (body.type && body.type !== "order") {
      await updateWebhookEvent(providerEventId, {
        status: "ignored",
        processed_at: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true });
    }

    const providerOrder = await getMercadoPagoOrder(providerOrderId);
    const externalReference =
      typeof providerOrder.external_reference === "string"
        ? providerOrder.external_reference
        : null;

    let localOrder = await findOrderByProviderOrderId(providerOrderId);
    if (!localOrder && externalReference) {
      localOrder = await findOrderByExternalReference(externalReference);
    }

    if (!localOrder) {
      await updateWebhookEvent(providerEventId, {
        status: "ignored",
        error_message: "local_order_not_found",
        processed_at: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true });
    }

    if (
      !externalReference ||
      externalReference !== localOrder.external_reference ||
      !sameMoney(localOrder.amount_ars, providerOrder.total_amount)
    ) {
      await updateWebhookEvent(providerEventId, {
        status: "failed",
        error_message: "order_integrity_mismatch",
        processed_at: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true });
    }

    const internalStatus = mapProviderOrderStatus(providerOrder);

    await updateOrderById(localOrder.id, {
      provider_order_id: providerOrder.id,
      status: internalStatus,
      live_mode:
        typeof providerOrder.live_mode === "boolean"
          ? providerOrder.live_mode
          : localOrder.live_mode,
      provider_payload: providerOrder,
      ...(internalStatus === "paid"
        ? { paid_at: localOrder.paid_at ?? new Date().toISOString() }
        : {}),
    });

    if (internalStatus === "paid") {
      await grantEntitlement({
        subject_id: localOrder.subject_id,
        matchday_slug: localOrder.matchday_slug,
        tier: localOrder.tier,
        source_order_id: localOrder.id,
      });
    } else if (
      internalStatus === "refunded" ||
      internalStatus === "cancelled" ||
      internalStatus === "failed"
    ) {
      await revokeEntitlement(localOrder.id);
    }

    await updateWebhookEvent(providerEventId, {
      status: "processed",
      processed_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Mercado Pago webhook processing failed", {
      providerEventId,
      providerOrderId,
      error: error instanceof Error ? error.message : "unknown",
    });

    try {
      await updateWebhookEvent(providerEventId, {
        status: "failed",
        error_message:
          error instanceof Error ? error.message.slice(0, 300) : "unknown",
        processed_at: new Date().toISOString(),
      });
    } catch {
      // Mercado Pago will retry because this request returns 500.
    }

    return NextResponse.json(
      { error: "webhook_processing_failed" },
      { status: 500 },
    );
  }
}
