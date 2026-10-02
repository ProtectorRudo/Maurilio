import { NextResponse } from "next/server";
import { sendPasswordRecovery } from "@/lib/server/maurilio-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: unknown };
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }

    const response = await sendPasswordRecovery(email);

    // Avoid leaking whether an account exists.
    if (!response.ok && response.status >= 500) {
      return NextResponse.json({ error: "recovery_unavailable" }, { status: 503 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "recovery_unavailable" }, { status: 503 });
  }
}
