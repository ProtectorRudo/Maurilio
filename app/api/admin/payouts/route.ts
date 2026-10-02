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

  const response = await callRpc("maurilio_admin_list_payouts", token);
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
      payoutId?: unknown;
      status?: unknown;
      providerReference?: unknown;
    };

    const payoutId =
      typeof body.payoutId === "string" ? body.payoutId.trim() : "";
    const status = typeof body.status === "string" ? body.status.trim() : "";
    const providerReference =
      typeof body.providerReference === "string"
        ? body.providerReference.trim().slice(0, 180)
        : null;

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payoutId) ||
      !["paid", "cancelled"].includes(status) ||
      (status === "paid" && !providerReference)
    ) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const response = await callRpc("maurilio_admin_set_payout_state", token, {
      p_payout_id: payoutId,
      p_status: status,
      p_provider_reference: providerReference,
    });
    const payload = await responseJson(response);
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
}
