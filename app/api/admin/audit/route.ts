import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  verifyAdminSession,
} from "@/lib/server/admin-auth";
import {
  databaseConfigured,
  getAuditEvents,
} from "@/lib/server/supabase-rest";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!verifyAdminSession(request.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!databaseConfigured()) {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }

  const requested = Number(request.nextUrl.searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), 250)
    : 100;

  try {
    const events = await getAuditEvents(limit);
    return NextResponse.json(
      { events },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json({ error: "audit_unavailable" }, { status: 503 });
  }
}
