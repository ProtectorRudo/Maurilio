import { NextResponse } from "next/server";
import {
  databaseConfigured,
  databaseReachable,
} from "@/lib/server/supabase-rest";

export const dynamic = "force-dynamic";

function authConfigured() {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
    (
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_SECRET_KEY
    ),
  );
}

export async function GET() {
  const database = await databaseReachable();
  const auth = authConfigured();

  const body = {
    status: database && auth ? "ok" : "degraded",
    product: "tipster_marketplace",
    database: {
      configured: databaseConfigured(),
      reachable: database,
    },
    auth: {
      configured: auth,
    },
  };

  return NextResponse.json(body, {
    status: database && auth ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
