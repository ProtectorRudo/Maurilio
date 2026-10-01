import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  verifyAdminSession,
} from "@/lib/server/admin-auth";
import { sameOrigin } from "@/lib/server/request-security";
import {
  closePublishedPickSale,
  databaseConfigured,
} from "@/lib/server/supabase-rest";

export const runtime = "nodejs";

const REASONS = new Set([
  "price_below_minimum",
  "market_unavailable",
  "late_information",
  "manual_risk_stop",
]);

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

  if (!verifyAdminSession(request.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!databaseConfigured()) {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }

  let body: {
    publicId?: unknown;
    reason?: unknown;
    observedOdds?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const publicId =
    typeof body.publicId === "string" ? body.publicId.trim() : "";
  const reason =
    typeof body.reason === "string" ? body.reason.trim() : "";

  if (!publicId || !REASONS.has(reason)) {
    return NextResponse.json({ error: "invalid_sale_stop" }, { status: 400 });
  }

  let observedOdds: number | null = null;
  if (
    body.observedOdds !== null &&
    body.observedOdds !== undefined &&
    body.observedOdds !== ""
  ) {
    const parsed = Number(body.observedOdds);
    if (!Number.isFinite(parsed) || parsed <= 1) {
      return NextResponse.json(
        { error: "invalid_observed_odds" },
        { status: 400 },
      );
    }
    observedOdds = parsed;
  }

  if (reason === "price_below_minimum" && observedOdds === null) {
    return NextResponse.json(
      { error: "observed_odds_required" },
      { status: 400 },
    );
  }

  try {
    const sale = await closePublishedPickSale({
      publicId,
      reason: reason as
        | "price_below_minimum"
        | "market_unavailable"
        | "late_information"
        | "manual_risk_stop",
      observedOdds,
    });

    return NextResponse.json(
      { ok: true, sale },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Sale risk stop failed", {
      publicId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "sale_stop_failed" }, { status: 422 });
  }
}
