import { NextResponse } from "next/server";
import {
  clearSessionCookies,
  revokeCurrentSession,
  routeAccessToken,
  updatePassword,
} from "@/lib/server/maurilio-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = await routeAccessToken();
  if (!token) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  try {
    const body = await request.json() as { password?: unknown };
    const password = typeof body.password === "string" ? body.password : "";

    if (password.length < 8 || password.length > 200) {
      return NextResponse.json({ error: "invalid_password" }, { status: 400 });
    }

    const response = await updatePassword(token, password);
    if (!response.ok) {
      return NextResponse.json({ error: "password_update_failed" }, { status: 400 });
    }

    await revokeCurrentSession(token).catch(() => false);
    await clearSessionCookies();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "password_update_failed" }, { status: 503 });
  }
}
