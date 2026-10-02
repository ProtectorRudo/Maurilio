import { NextRequest, NextResponse } from "next/server";
import {
  databaseConfigured,
  getLatestPublishedMatchday,
  getPublishedPickByTier,
  hasActiveEntitlement,
  reserveOrder,
  updateOrderByExternalReference,
} from "@/lib/server/supabase-rest";
import {
  createMercadoPagoOrder,
  mapProviderOrderStatus,
  mercadoPagoConfigured,
} from "@/lib/server/mercadopago";

type Tier = "pro" | "elite";

const ACCESS_COOKIE = "maurilio_sid";
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
    mercadoPagoConfigured() &&
    databaseConfigured()
  );
}

function saleOpen(pick: {
  event_start_at: string | null;
  sale_status: "open" | "closed";
}) {
  if (pick.sale_status !== "open" || !pick.event_start_at) return false;
  const starts = new Date(pick.event_start_at).getTime();
  return Number.isFinite(starts) && starts > Date.now();
}

function validUuid(value: string | undefined) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(SITE_URL).origin;
  } catch {
    return false;
  }
}

export async function GET() {
  let availability = { pro: false, elite: false };

  if (databaseConfigured()) {
    try {
      const activeMatchday = await getLatestPublishedMatchday();
      if (activeMatchday) {
        const [proPick, elitePick] = await Promise.all([
          getPublishedPickByTier(activeMatchday.slug, "pro"),
          getPublishedPickByTier(activeMatchday.slug, "elite"),
        ]);
        availability = {
          pro: Boolean(proPick && saleOpen(proPick)),
          elite: Boolean(elitePick && saleOpen(elitePick)),
        };
      }
    } catch {
      availability = { pro: false, elite: false };
    }
  }

  return NextResponse.json(
    {
      enabled: checkoutEnabled(),
      provider: "mercado_pago",
      prices: {
        pro: readPrice("pro"),
        elite: readPrice("elite"),
      },
      availability,
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

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

  const activeMatchday = await getLatestPublishedMatchday().catch(() => null);
  if (!activeMatchday) {
    return NextResponse.json(
      { error: "no_active_matchday" },
      { status: 409 },
    );
  }

  const publishedPick = await getPublishedPickByTier(
    activeMatchday.slug,
    tier,
  ).catch(() => null);

  if (!publishedPick) {
    return NextResponse.json(
      { error: "tier_not_available" },
      { status: 409 },
    );
  }

  if (publishedPick.sale_status !== "open") {
    return NextResponse.json(
      { error: "sale_closed" },
      { status: 409 },
    );
  }

  if (!saleOpen(publishedPick)) {
    return NextResponse.json(
      { error: "event_started" },
      { status: 409 },
    );
  }

  const currentCookie = request.cookies.get(ACCESS_COOKIE)?.value;
  const subjectId = validUuid(currentCookie)
    ? currentCookie!
    : crypto.randomUUID();

  const existingAccess = await hasActiveEntitlement(
    subjectId,
    activeMatchday.slug,
    tier,
  ).catch(() => false);

  if (existingAccess) {
    return NextResponse.json(
      { error: "already_unlocked" },
      { status: 409 },
    );
  }

  const externalReference =
    `maurilio_${activeMatchday.slug}_${tier}_${crypto.randomUUID()}`;

  let reservedReference = externalReference;

  try {
    const reservation = await reserveOrder({
      externalReference,
      subjectId,
      matchdaySlug: activeMatchday.slug,
      tier,
      amountArs: amount,
    });

    reservedReference = reservation.external_reference;

    if (reservation.reused) {
      if (reservation.checkout_url && reservation.provider_order_id) {
        const response = NextResponse.json(
          {
            orderId: reservation.provider_order_id,
            checkoutUrl: reservation.checkout_url,
            reused: true,
          },
          {
            headers: {
              "Cache-Control": "private, no-store, max-age=0",
            },
          },
        );

        response.cookies.set(ACCESS_COOKIE, subjectId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/maurilio",
          maxAge: 60 * 60 * 24 * 90,
        });

        return response;
      }

      return NextResponse.json(
        { error: "checkout_initializing" },
        { status: 409 },
      );
    }

    const providerOrder = await createMercadoPagoOrder({
      externalReference: reservedReference,
      amount,
      tier,
      siteUrl: SITE_URL,
    });

    await updateOrderByExternalReference(reservedReference, {
      provider_order_id: providerOrder.id,
      status: mapProviderOrderStatus(providerOrder),
      checkout_url: providerOrder.checkout_url,
      live_mode:
        typeof providerOrder.live_mode === "boolean"
          ? providerOrder.live_mode
          : null,
      provider_payload: providerOrder,
    });

    const response = NextResponse.json(
      {
        orderId: providerOrder.id,
        checkoutUrl: providerOrder.checkout_url,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );

    response.cookies.set(ACCESS_COOKIE, subjectId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/maurilio",
      maxAge: 60 * 60 * 24 * 90,
    });

    return response;
  } catch (error) {
    console.error("Checkout initialization failed", {
      externalReference: reservedReference,
      error: error instanceof Error ? error.message : "unknown",
    });

    try {
      await updateOrderByExternalReference(reservedReference, {
        status: "failed",
      });
    } catch {
      // If persistence itself is unavailable, checkout remains failed closed.
    }

    return NextResponse.json(
      { error: "checkout_initialization_failed" },
      { status: 502 },
    );
  }
}
