import { NextResponse } from "next/server";
import {
  callEdge,
  responseJson,
  routeAccessToken,
} from "@/lib/server/maurilio-session";

export const dynamic = "force-dynamic";

async function forward(body: Record<string, unknown>) {
  const token = await routeAccessToken();
  if (!token) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  const response = await callEdge("maurilio-promotion-checkout", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const payload = await responseJson(response);
  return NextResponse.json(payload, { status: response.status });
}

export async function GET() {
  return forward({ action: "status" });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { days?: unknown };
    const days = Number(body.days);
    if (![3, 7, 14, 30].includes(days)) {
      return NextResponse.json({ error: "invalid_duration" }, { status: 400 });
    }
    return forward({ action: "create", days });
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
}
