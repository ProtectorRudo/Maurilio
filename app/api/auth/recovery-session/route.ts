import { NextResponse } from "next/server";
import { validateRecoverySession } from "@/lib/server/maurilio-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      accessToken?: unknown;
      refreshToken?: unknown;
      expiresIn?: unknown;
    };

    const accessToken =
      typeof body.accessToken === "string" ? body.accessToken.trim() : "";
    const refreshToken =
      typeof body.refreshToken === "string" ? body.refreshToken.trim() : "";
    const expiresIn = Number(body.expiresIn);

    if (
      accessToken.length < 20 ||
      refreshToken.length < 20 ||
      accessToken.length > 5000 ||
      refreshToken.length > 5000
    ) {
      return NextResponse.json({ error: "invalid_recovery_session" }, { status: 400 });
    }

    const valid = await validateRecoverySession({
      accessToken,
      refreshToken,
      expiresIn: Number.isFinite(expiresIn) ? expiresIn : undefined,
    });

    if (!valid) {
      return NextResponse.json({ error: "invalid_recovery_session" }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "invalid_recovery_session" }, { status: 400 });
  }
}
