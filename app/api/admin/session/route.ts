import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/server/request-security";
import {
  adminLoginGate,
  databaseConfigured,
} from "@/lib/server/supabase-rest";
import {
  ADMIN_COOKIE,
  adminConfigured,
  adminCookieMaxAge,
  adminThrottleKey,
  createAdminSession,
  verifyAdminSecret,
} from "@/lib/server/admin-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

  if (!adminConfigured()) {
    return NextResponse.json(
      { error: "admin_not_configured" },
      { status: 503 },
    );
  }

  if (!databaseConfigured()) {
    return NextResponse.json(
      { error: "admin_security_unavailable" },
      { status: 503 },
    );
  }

  const throttleKey = adminThrottleKey({
    forwardedFor: request.headers.get("x-forwarded-for"),
    realIp: request.headers.get("x-real-ip"),
    userAgent: request.headers.get("user-agent"),
  });

  let gate;
  try {
    gate = await adminLoginGate(throttleKey, "check");
  } catch {
    return NextResponse.json(
      { error: "admin_security_unavailable" },
      { status: 503 },
    );
  }

  if (!gate.allowed) {
    return NextResponse.json(
      { error: "too_many_attempts" },
      {
        status: 429,
        headers: gate.blocked_until
          ? {
              "Retry-After": String(
                Math.max(
                  Math.ceil(
                    (new Date(gate.blocked_until).getTime() - Date.now()) / 1000,
                  ),
                  1,
                ),
              ),
            }
          : undefined,
      },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!verifyAdminSecret(password)) {
    const failed = await adminLoginGate(throttleKey, "failure").catch(() => null);
    if (failed && !failed.allowed) {
      return NextResponse.json(
        { error: "too_many_attempts" },
        {
          status: 429,
          headers: failed.blocked_until
            ? {
                "Retry-After": String(
                  Math.max(
                    Math.ceil(
                      (new Date(failed.blocked_until).getTime() - Date.now()) /
                        1000,
                    ),
                    1,
                  ),
                ),
              }
            : undefined,
        },
      );
    }
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  await adminLoginGate(throttleKey, "success").catch(() => null);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, createAdminSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/maurilio",
    maxAge: adminCookieMaxAge(),
  });
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/maurilio",
    maxAge: 0,
  });
  return response;
}
