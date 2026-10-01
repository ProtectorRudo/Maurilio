import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  verifyAdminSession,
} from "@/lib/server/admin-auth";
import {
  databaseConfigured,
  settlePublishedPick,
} from "@/lib/server/supabase-rest";

export const runtime = "nodejs";

function authorized(request: NextRequest) {
  return verifyAdminSession(request.cookies.get(ADMIN_COOKIE)?.value);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!databaseConfigured()) {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }

  let body: {
    publicId?: unknown;
    result?: unknown;
    closingOdds?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const publicId =
    typeof body.publicId === "string" ? body.publicId.trim() : "";
  const result =
    typeof body.result === "string" ? body.result.trim().toLowerCase() : "";

  if (!publicId || !["win", "loss", "push", "void"].includes(result)) {
    return NextResponse.json({ error: "invalid_settlement" }, { status: 400 });
  }

  let closingOdds: number | null = null;
  if (body.closingOdds !== null && body.closingOdds !== undefined && body.closingOdds !== "") {
    const parsed = Number(body.closingOdds);
    if (!Number.isFinite(parsed) || parsed <= 1) {
      return NextResponse.json({ error: "invalid_closing_odds" }, { status: 400 });
    }
    closingOdds = parsed;
  }

  if (result !== "void" && closingOdds === null) {
    return NextResponse.json(
      { error: "closing_odds_required" },
      { status: 400 },
    );
  }

  try {
    const settled = await settlePublishedPick({
      publicId,
      result: result as "win" | "loss" | "push" | "void",
      closingOdds,
    });

    return NextResponse.json(
      { ok: true, settlement: settled },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Pick settlement failed", {
      publicId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "settlement_failed" }, { status: 422 });
  }
}
