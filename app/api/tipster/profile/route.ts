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
    const body = await request.json() as {
      slug?: unknown;
      displayName?: unknown;
      headline?: unknown;
      sports?: unknown;
      specialties?: unknown;
      monthlyPriceArs?: unknown;
    };

    const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
    const displayName =
      typeof body.displayName === "string" ? body.displayName.trim() : "";
    const headline =
      typeof body.headline === "string" ? body.headline.trim().slice(0, 120) : "";
    const sports = Array.isArray(body.sports)
      ? body.sports.filter((x): x is string => typeof x === "string").slice(0, 10)
      : [];
    const specialties = Array.isArray(body.specialties)
      ? body.specialties.filter((x): x is string => typeof x === "string").slice(0, 12)
      : [];
    const price = Number(body.monthlyPriceArs);

    if (
      !/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug) ||
      displayName.length < 2 ||
      displayName.length > 60 ||
      (!Number.isFinite(price) && body.monthlyPriceArs !== null)
    ) {
      return NextResponse.json({ error: "invalid_profile" }, { status: 400 });
    }

    const activate = await callRpc("maurilio_become_tipster", token);
    if (!activate.ok) {
      return NextResponse.json(await responseJson(activate), { status: activate.status });
    }

    const response = await callRpc("maurilio_upsert_tipster_profile", token, {
      p_slug: slug,
      p_display_name: displayName,
      p_headline: headline || null,
      p_sports: sports,
      p_specialties: specialties,
      p_monthly_price_ars:
        Number.isFinite(price) && price >= 0 ? price : null,
    });

    const payload = await responseJson(response);
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    console.error("Tipster profile update failed", error);
    return NextResponse.json({ error: "profile_unavailable" }, { status: 503 });
  }
}
