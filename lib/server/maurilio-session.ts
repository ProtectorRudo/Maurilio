import { cookies } from "next/headers";

const ACCESS_COOKIE = "maurilio_access";
const REFRESH_COOKIE = "maurilio_refresh";

type SessionPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user?: Record<string, unknown>;
  error?: string;
  error_description?: string;
  msg?: string;
};

function runtimeConfig() {
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    "";

  if (!url || !key) return null;
  return { url, key };
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/maurilio",
    maxAge,
  };
}

async function parseJson(response: Response) {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) as SessionPayload : {};
  } catch {
    return {};
  }
}

async function authFetch(path: string, init: RequestInit) {
  const cfg = runtimeConfig();
  if (!cfg) throw new Error("auth_not_configured");

  return fetch(`${cfg.url}${path}`, {
    ...init,
    headers: {
      apikey: cfg.key,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
}

export async function setSessionCookies(payload: SessionPayload) {
  if (!payload.access_token || !payload.refresh_token) return false;
  const jar = await cookies();
  const expires = Number(payload.expires_in);
  jar.set(
    ACCESS_COOKIE,
    payload.access_token,
    cookieOptions(Number.isFinite(expires) && expires > 0 ? expires : 3600),
  );
  jar.set(
    REFRESH_COOKIE,
    payload.refresh_token,
    cookieOptions(60 * 60 * 24 * 30),
  );
  return true;
}

export async function clearSessionCookies() {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, "", cookieOptions(0));
  jar.set(REFRESH_COOKIE, "", cookieOptions(0));
}

export async function signInWithPassword(email: string, password: string) {
  const response = await authFetch("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const body = await parseJson(response);
  return { response, body };
}

export async function signUpWithPassword(
  email: string,
  password: string,
  displayName?: string,
) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const redirectTo = /^https:\/\//i.test(siteUrl)
    ? `${siteUrl}/ingresar?confirmed=1`
    : null;
  const signupPath = redirectTo
    ? `/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`
    : "/auth/v1/signup";

  const response = await authFetch(signupPath, {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      data: displayName ? { display_name: displayName } : {},
    }),
  });
  const body = await parseJson(response);
  return { response, body };
}

async function refreshAccessToken(refreshToken: string) {
  const response = await authFetch("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const body = await parseJson(response);
  if (!response.ok || !body.access_token || !body.refresh_token) return null;
  await setSessionCookies(body);
  return body.access_token;
}

export async function routeAccessToken() {
  const jar = await cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  if (access) return access;

  const refresh = jar.get(REFRESH_COOKIE)?.value;
  if (!refresh) return null;

  try {
    return await refreshAccessToken(refresh);
  } catch {
    await clearSessionCookies();
    return null;
  }
}

export async function userApiFetch(
  path: string,
  accessToken: string,
  init: RequestInit = {},
) {
  const cfg = runtimeConfig();
  if (!cfg) throw new Error("auth_not_configured");

  return fetch(`${cfg.url}${path}`, {
    ...init,
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
}

export async function callEdge(
  functionName: string,
  accessToken: string,
  init: RequestInit = {},
) {
  return userApiFetch(
    `/functions/v1/${functionName}`,
    accessToken,
    init,
  );
}

export async function callRpc(
  functionName: string,
  accessToken: string,
  body: Record<string, unknown> = {},
) {
  return userApiFetch(
    `/rest/v1/rpc/${functionName}`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export async function responseJson(response: Response) {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
