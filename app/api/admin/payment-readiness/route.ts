import { NextResponse } from "next/server";
import {
  callEdge,
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

  const adminCheck = await callRpc("maurilio_admin_list_tipsters", token);
  if (!adminCheck.ok) {
    return NextResponse.json({ error: "admin_required" }, { status: 403 });
  }

  const statusResponse = await callEdge("maurilio-subscriptions", token, {
    method: "POST",
    body: JSON.stringify({ action: "status" }),
  });

  const status = await responseJson(statusResponse);
  return NextResponse.json(status, { status: statusResponse.status });
}
