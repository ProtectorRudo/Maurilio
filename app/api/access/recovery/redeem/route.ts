import { NextRequest, NextResponse } from "next/server";
import {
  normalizeRecoveryCode,
  recoveryCodeHash,
} from "@/lib/server/access-recovery";
import {
  consumeRecoveryCode,
  databaseConfigured,
} from "@/lib/server/supabase-rest";

export const runtime = "nodejs";

const ACCESS_COOKIE = "maurilio_sid";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://viralio.net/maurilio";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(SITE_URL).origin;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

  if (!databaseConfigured()) {
    return NextResponse.json(
      { error: "recovery_unavailable" },
      { status: 503 },
    );
  }

  let code = "";
  try {
    const body = (await request.json()) as { code?: unknown };
    if (typeof body.code !== "string") {
      return NextResponse.json({ error: "invalid_code" }, { status: 400 });
    }
    code = body.code;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const normalized = normalizeRecoveryCode(code);
  if (!normalized) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  try {
    const recovered = await consumeRecoveryCode(recoveryCodeHash(normalized));

    const response = NextResponse.json(
      {
        ok: true,
        activeEntitlements: recovered.active_entitlements,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "X-Robots-Tag": "noindex, nofollow, noarchive",
          "Referrer-Policy": "no-referrer",
        },
      },
    );

    response.cookies.set(ACCESS_COOKIE, recovered.subject_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/maurilio",
      maxAge: 60 * 60 * 24 * 90,
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "invalid_or_expired_code" },
      { status: 403 },
    );
  }
}
