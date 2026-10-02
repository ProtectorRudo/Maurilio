import { NextResponse } from "next/server";
import {
  callEdge,
  responseJson,
  routeAccessToken,
} from "@/lib/server/maurilio-session";

export const dynamic = "force-dynamic";

const allowedViews = new Set(["status", "events", "odds"]);

export async function GET(request: Request) {
  const token = await routeAccessToken();
  if (!token) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  const source = new URL(request.url);
  const view = source.searchParams.get("view") ?? "status";

  if (!allowedViews.has(view)) {
    return NextResponse.json({ error: "invalid_view" }, { status: 400 });
  }

  const query = new URLSearchParams({ view });
  for (const key of [
    "sport",
    "league",
    "limit",
    "start_from",
    "start_to",
    "event_id",
    "types",
    "market_keys",
    "periods",
  ]) {
    const value = source.searchParams.get(key);
    if (value) query.set(key, value.slice(0, 300));
  }

  const response = await callEdge(
    `maurilio-bet365?${query.toString()}`,
    token,
    { method: "GET" },
  );
  const payload = await responseJson(response);
  return NextResponse.json(payload, { status: response.status });
}
