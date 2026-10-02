import { NextResponse } from "next/server";
import {
  setSessionCookies,
  signUpWithPassword,
} from "@/lib/server/maurilio-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      email?: unknown;
      password?: unknown;
      displayName?: unknown;
    };

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const displayName =
      typeof body.displayName === "string" ? body.displayName.trim().slice(0, 60) : "";

    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 200) {
      return NextResponse.json({ error: "invalid_signup" }, { status: 400 });
    }

    const auth = await signUpWithPassword(email, password, displayName || undefined);
    if (!auth.response.ok) {
      return NextResponse.json({ error: "signup_failed" }, { status: 400 });
    }

    const sessionCreated = await setSessionCookies(auth.body);

    return NextResponse.json({
      ok: true,
      confirmationRequired: !sessionCreated,
    });
  } catch (error) {
    console.error("Maurilio signup failed", error);
    return NextResponse.json({ error: "signup_unavailable" }, { status: 503 });
  }
}
