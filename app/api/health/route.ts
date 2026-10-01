import { NextResponse } from "next/server";
import {
  databaseConfigured,
  databaseReachable,
} from "@/lib/server/supabase-rest";
import {
  mercadoPagoConfigured,
  mercadoPagoWebhookConfigured,
} from "@/lib/server/mercadopago";

export async function GET() {
  const database = await databaseReachable();
  const checkoutFlag = process.env.MAURILIO_CHECKOUT_ENABLED === "1";
  const paymentCredentials =
    mercadoPagoConfigured() && mercadoPagoWebhookConfigured();

  const body = {
    status: database ? "ok" : "degraded",
    database: {
      configured: databaseConfigured(),
      reachable: database,
    },
    payments: {
      configured: paymentCredentials,
      enabled: checkoutFlag && database && paymentCredentials,
    },
  };

  return NextResponse.json(body, {
    status: database ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
