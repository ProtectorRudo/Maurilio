import { NextResponse } from "next/server";
import {
  clearSessionCookies,
  revokeCurrentSession,
  routeAccessToken,
} from "@/lib/server/maurilio-session";

export const dynamic = "force-dynamic";

export async function POST() {
  const token = await routeAccessToken();

  if (token) {
    await revokeCurrentSession(token).catch(() => false);
  }

  await clearSessionCookies();
  return NextResponse.json({ ok: true });
}
