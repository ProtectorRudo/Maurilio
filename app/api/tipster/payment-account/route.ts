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

  const response = await callEdge("maurilio-mercadopago-connect", token, {
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
    const body = await request.json() as {
      action?: unknown;
      code?: unknown;
      state?: unknown;
    };

    const action = typeof body.action === "string" ? body.action : "";
    if (!["start", "complete", "disconnect"].includes(action)) {
      return NextResponse.json({ error: "invalid_action" }, { status: 400 });
    }

    return forward(body as Record<string, unknown>);
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
}
