import { NextResponse } from "next/server";
import {
  setSessionCookies,
  signInWithPassword,
} from "@/lib/server/maurilio-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 200) {
      return NextResponse.json({ error: "invalid_credentials" }, { status: 400 });
    }

    const auth = await signInWithPassword(email, password);
    if (!auth.response.ok || !auth.body.access_token || !auth.body.refresh_token) {
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }

    await setSessionCookies(auth.body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Maurilio login failed", error);
    return NextResponse.json({ error: "login_unavailable" }, { status: 503 });
  }
}
