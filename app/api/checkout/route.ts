import { NextResponse } from "next/server";

type Tier = "pro" | "elite";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://viralio.net/maurilio";

function readPrice(tier: Tier): number | null {
  const raw =
    tier === "pro"
      ? process.env.MAURILIO_PRO_PRICE_ARS
      : process.env.MAURILIO_ELITE_PRICE_ARS;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function checkoutEnabled() {
  return (
    process.env.MAURILIO_CHECKOUT_ENABLED === "1" &&
    Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN)
  );
}

export async function GET() {
  return NextResponse.json(
    {
      enabled:
        checkoutEnabled() &&
        Boolean(readPrice("pro")) &&
        Boolean(readPrice("elite")),
      provider: "mercado_pago",
      prices: {
        pro: readPrice("pro"),
        elite: readPrice("elite"),
      },
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}

export async function POST(request: Request) {
  if (!checkoutEnabled()) {
    return NextResponse.json(
      { error: "checkout_disabled" },
      { status: 503 },
    );
  }

  let tier: Tier;
  try {
    const body = (await request.json()) as { tier?: unknown };
    if (body.tier !== "pro" && body.tier !== "elite") {
      return NextResponse.json({ error: "invalid_tier" }, { status: 400 });
    }
    tier = body.tier;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const amount = readPrice(tier);
  if (!amount) {
    return NextResponse.json(
      { error: "price_not_configured" },
      { status: 503 },
    );
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: "provider_not_configured" },
      { status: 503 },
    );
  }

  const orderRef = `maurilio_${tier}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const amountString = amount.toFixed(2);
  const title =
    tier === "elite"
      ? "Maurilio — High Conviction"
      : "Maurilio — Análisis PRO";

  const providerResponse = await fetch(
    "https://api.mercadopago.com/v1/orders",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        type: "online",
        processing_mode: "manual",
        total_amount: amountString,
        external_reference: orderRef,
        description: title,
        items: [
          {
            title,
            quantity: 1,
            unit_measure: "unit",
            unit_price: amountString,
            total_amount: amountString,
          },
        ],
        config: {
          online: {
            success_url: `${SITE_URL}/access/success`,
            pending_url: `${SITE_URL}/access/pending`,
            failure_url: `${SITE_URL}/access/failure`,
            auto_return: "all",
          },
        },
      }),
      cache: "no-store",
    },
  );

  const providerBody = (await providerResponse.json()) as {
    id?: string;
    checkout_url?: string;
    message?: string;
  };

  if (!providerResponse.ok || !providerBody.checkout_url) {
    console.error("Mercado Pago order creation failed", {
      status: providerResponse.status,
      message: providerBody.message,
    });
    return NextResponse.json(
      { error: "provider_error" },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      orderId: providerBody.id,
      checkoutUrl: providerBody.checkout_url,
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}
