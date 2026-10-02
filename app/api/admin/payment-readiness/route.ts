import { NextResponse } from "next/server";
import {
  callEdge,
  callRpc,
  responseJson,
  routeAccessToken,
} from "@/lib/server/maurilio-session";

export const dynamic = "force-dynamic";

async function adminToken() {
  const token = await routeAccessToken();
  if (!token) return null;

  const adminCheck = await callRpc("maurilio_admin_payment_settings", token);
  if (!adminCheck.ok) return null;

  return token;
}

export async function GET() {
  const token = await adminToken();
  if (!token) {
    return NextResponse.json({ error: "admin_required" }, { status: 403 });
  }

  const statusResponse = await callEdge("maurilio-subscriptions", token, {
    method: "POST",
    body: JSON.stringify({ action: "status" }),
  });

  const status = await responseJson(statusResponse);
  return NextResponse.json(status, { status: statusResponse.status });
}

export async function POST(request: Request) {
  const token = await adminToken();
  if (!token) {
    return NextResponse.json({ error: "admin_required" }, { status: 403 });
  }

  try {
    const body = await request.json() as { platformFeeBps?: unknown };
    const platformFeeBps = Number(body.platformFeeBps);

    if (
      !Number.isInteger(platformFeeBps) ||
      platformFeeBps < 1 ||
      platformFeeBps > 5000
    ) {
      return NextResponse.json({ error: "invalid_platform_fee" }, { status: 400 });
    }

    const response = await callRpc("maurilio_admin_set_platform_fee", token, {
      p_fee_bps: platformFeeBps,
    });
    const payload = await responseJson(response);
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
}
