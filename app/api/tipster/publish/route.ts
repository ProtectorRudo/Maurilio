import { NextResponse } from "next/server";
import {
  callEdge,
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
    const body = await request.json() as {
      eventId?: unknown;
      selectionKey?: unknown;
      stakeUnits?: unknown;
    };

    const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
    const selectionKey =
      typeof body.selectionKey === "string" ? body.selectionKey.trim() : "";
    const stakeUnits = Number(body.stakeUnits);

    if (
      !/^[A-Za-z0-9._:-]{1,120}$/.test(eventId) ||
      !selectionKey ||
      selectionKey.length > 240 ||
      !Number.isFinite(stakeUnits) ||
      stakeUnits <= 0 ||
      stakeUnits > 5
    ) {
      return NextResponse.json({ error: "invalid_tip" }, { status: 400 });
    }

    const response = await callEdge("maurilio-tipster-publish", token, {
      method: "POST",
      body: JSON.stringify({ eventId, selectionKey, stakeUnits }),
    });
    const payload = await responseJson(response);
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
}
