import { NextResponse } from "next/server";
import {
  callRpc,
  responseJson,
  routeAccessToken,
} from "@/lib/server/maurilio-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = await routeAccessToken();
  if (!token) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  const response = await callRpc("maurilio_admin_list_tipsters", token);
  const payload = await responseJson(response);
  return NextResponse.json(payload, { status: response.status });
}

export async function POST(request: Request) {
  const token = await routeAccessToken();
  if (!token) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  try {
    const body = await request.json() as {
      tipsterId?: unknown;
      status?: unknown;
      verified?: unknown;
    };

    const tipsterId =
      typeof body.tipsterId === "string" ? body.tipsterId.trim() : "";
    const status =
      typeof body.status === "string" ? body.status.trim() : null;
    const verified =
      typeof body.verified === "boolean" ? body.verified : null;

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tipsterId) ||
      (status !== null && !["draft", "published", "suspended"].includes(status)) ||
      (status === null && verified === null)
    ) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const response = await callRpc("maurilio_admin_set_tipster_state", token, {
      p_tipster_id: tipsterId,
      p_status: status,
      p_verified: verified,
    });
    const payload = await responseJson(response);
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
}
