import { NextRequest, NextResponse } from "next/server";
import {
  databaseConfigured,
  getLatestPublishedMatchday,
  hasActiveEntitlement,
} from "@/lib/server/supabase-rest";

const ACCESS_COOKIE = "maurilio_sid";

function validUuid(value: string | undefined) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
}

export async function GET(request: NextRequest) {
  const subjectId = request.cookies.get(ACCESS_COOKIE)?.value;

  if (!databaseConfigured() || !validUuid(subjectId)) {
    return NextResponse.json(
      {
        matchday: null,
        pro: false,
        elite: false,
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }

  try {
    const activeMatchday = await getLatestPublishedMatchday();
    if (!activeMatchday) {
      return NextResponse.json(
        { matchday: null, pro: false, elite: false },
        { headers: { "Cache-Control": "private, no-store, max-age=0" } },
      );
    }

    const [pro, elite] = await Promise.all([
      hasActiveEntitlement(subjectId!, activeMatchday.slug, "pro"),
      hasActiveEntitlement(subjectId!, activeMatchday.slug, "elite"),
    ]);

    return NextResponse.json(
      {
        matchday: activeMatchday.slug,
        pro,
        elite,
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Entitlement lookup failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "access_lookup_failed" },
      { status: 503 },
    );
  }
}
