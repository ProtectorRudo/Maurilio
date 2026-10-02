import { NextResponse } from "next/server";
import {
  callRpc,
  responseJson,
  routeAccessToken,
} from "@/lib/server/maurilio-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = await routeAccessToken();
  if (!token) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  try {
    const body = await request.json() as { accepting?: unknown };
    if (typeof body.accepting !== "boolean") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const response = await callRpc("maurilio_set_tipster_sales", token, {
      p_accepting: body.accepting,
    });
    const payload = await responseJson(response);
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
}
