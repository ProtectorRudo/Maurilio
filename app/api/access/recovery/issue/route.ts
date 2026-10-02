import { NextRequest, NextResponse } from "next/server";
import {
  createRecoveryCode,
  normalizeRecoveryCode,
  recoveryCodeHash,
} from "@/lib/server/access-recovery";
import {
  databaseConfigured,
  issueRecoveryCode,
} from "@/lib/server/supabase-rest";

export const runtime = "nodejs";

const ACCESS_COOKIE = "maurilio_sid";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://viralio.net/maurilio";

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

  const subjectId = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!validUuid(subjectId)) {
    return NextResponse.json({ error: "access_required" }, { status: 403 });
  }

  const code = createRecoveryCode();
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) {
    return NextResponse.json({ error: "recovery_unavailable" }, { status: 503 });
  }

  try {
    const issued = await issueRecoveryCode(
      subjectId!,
      recoveryCodeHash(normalized),
    );

    return NextResponse.json(
      {
        code,
        expiresAt: issued.expires_at,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "X-Robots-Tag": "noindex, nofollow, noarchive",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "recovery_unavailable" },
      { status: 409 },
    );
  }
}
