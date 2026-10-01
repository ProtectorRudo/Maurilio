import type { NextRequest } from "next/server";

function configuredOrigin() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const actual = new URL(origin).origin;
    const allowed = new Set(
      [configuredOrigin(), request.nextUrl.origin].filter(
        (value): value is string => Boolean(value),
      ),
    );
    return allowed.has(actual);
  } catch {
    return false;
  }
}
