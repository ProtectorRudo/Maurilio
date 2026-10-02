import { NextResponse } from "next/server";
import {
  callEdge,
  responseJson,
  routeAccessToken,
} from "@/lib/server/maurilio-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = await routeAccessToken();
  if (!token) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  const response = await callEdge("maurilio-subscriber-feed", token, {
    method: "GET",
  });
  const payload = await responseJson(response);
  return NextResponse.json(payload, { status: response.status });
}
