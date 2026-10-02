import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Json = Record<string, unknown> | Array<unknown>;

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function reply(body: Json, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

function config() {
  const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const key =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    (() => {
      try {
        const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
        return keys.default as string | undefined;
      } catch {
        return undefined;
      }
    })();

  if (!url || !key) throw new Error("server_config_missing");
  return { url, key };
}

function marketplaceConfig() {
  const clientId = Deno.env.get("MERCADOPAGO_CLIENT_ID")?.trim();
  const clientSecret = Deno.env.get("MERCADOPAGO_CLIENT_SECRET")?.trim();
  const encryptionSecret = Deno.env.get("MAURILIO_TOKEN_ENCRYPTION_KEY")?.trim();
  const siteUrl = (Deno.env.get("MAURILIO_SITE_URL") || "https://viralio.net/maurilio")
    .replace(/\/$/, "");

  if (!clientId || !clientSecret || !encryptionSecret) return null;

  return {
    clientId,
    clientSecret,
    encryptionSecret,
    redirectUri: `${siteUrl}/conectar-mercadopago`,
  };
}

async function db<T>(
  path: string,
  options: RequestInit = {},
  prefer?: string,
): Promise<T> {
  const { url, key } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
      ...(options.headers || {}),
    },
  });

  const raw = await response.text();
  if (!response.ok) {
    console.error("mercadopago_connect_db_failed", path, response.status, raw.slice(0, 300));
    throw new Error(`db_failed_${response.status}`);
  }

  return raw ? JSON.parse(raw) as T : undefined as T;
}

async function authUser(request: Request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;

  const { url } = config();
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!anon) throw new Error("anon_key_missing");

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: auth },
  });

  if (!response.ok) return null;
  const body = await response.json() as { id?: string };
  return typeof body.id === "string" ? body.id : null;
}

async function tipsterForUser(userId: string) {
  const rows = await db<Array<{ id: string }>>(
    `maurilio_tipsters?select=id&owner_user_id=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  return rows[0] ?? null;
}

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64(bytes: Uint8Array) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
}

function base64ToBytes(value: string) {
  const raw = atob(value);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function encryptionKey(secret: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptValue(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(secret);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );

  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function exchangeCode(input: {
  code: string;
  state: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    state: input.state,
  });

  const response = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    console.error("mercadopago_oauth_exchange_failed", response.status, payload);
    throw new Error("mercadopago_oauth_exchange_failed");
  }

  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token : "";
  const refreshToken =
    typeof payload.refresh_token === "string" ? payload.refresh_token : "";
  const providerUserId =
    payload.user_id !== undefined ? String(payload.user_id) : "";

  if (!accessToken || !refreshToken || !providerUserId) {
    throw new Error("mercadopago_oauth_response_invalid");
  }

  return {
    accessToken,
    refreshToken,
    providerUserId,
    publicKey:
      typeof payload.public_key === "string" ? payload.public_key : null,
    scope: typeof payload.scope === "string" ? payload.scope : null,
    liveMode: payload.live_mode === true,
    expiresIn: Number(payload.expires_in),
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return reply({ error: "method_not_allowed" }, 405);
  }

  try {
    const userId = await authUser(request);
    if (!userId) return reply({ error: "authentication_required" }, 401);

    const tipster = await tipsterForUser(userId);
    if (!tipster) return reply({ error: "tipster_profile_required" }, 409);

    const body = await request.json() as {
      action?: unknown;
      code?: unknown;
      state?: unknown;
    };
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "status") {
      const rows = await db<Array<{
        provider_user_id: string;
        live_mode: boolean;
        token_expires_at: string | null;
        connected_at: string;
        revoked_at: string | null;
      }>>(
        `maurilio_tipster_payment_accounts?select=provider_user_id,live_mode,token_expires_at,connected_at,revoked_at&tipster_id=eq.${encodeURIComponent(tipster.id)}&limit=1`,
      );
      const account = rows[0] ?? null;

      return reply({
        configured: Boolean(marketplaceConfig()),
        connected: Boolean(account && !account.revoked_at),
        provider: "mercado_pago",
        providerUserId: account && !account.revoked_at ? account.provider_user_id : null,
        liveMode: account && !account.revoked_at ? account.live_mode : false,
        tokenExpiresAt: account && !account.revoked_at ? account.token_expires_at : null,
        connectedAt: account && !account.revoked_at ? account.connected_at : null,
      });
    }

    const mp = marketplaceConfig();
    if (!mp) {
      return reply({ error: "marketplace_payments_not_configured" }, 503);
    }

    if (action === "start") {
      const state = randomState();
      const stateHash = await sha256(state);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      await db(
        "maurilio_payment_oauth_states",
        {
          method: "POST",
          body: JSON.stringify({
            state_hash: stateHash,
            user_id: userId,
            tipster_id: tipster.id,
            provider: "mercado_pago",
            expires_at: expiresAt,
          }),
        },
        "return=minimal",
      );

      const authUrl = new URL("https://auth.mercadopago.com.ar/authorization");
      authUrl.searchParams.set("client_id", mp.clientId);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("platform_id", "mp");
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("redirect_uri", mp.redirectUri);

      return reply({ authorizationUrl: authUrl.toString() });
    }

    if (action === "complete") {
      const code = typeof body.code === "string" ? body.code.trim() : "";
      const state = typeof body.state === "string" ? body.state.trim() : "";

      if (
        code.length < 8 ||
        code.length > 500 ||
        state.length < 20 ||
        state.length > 500
      ) {
        return reply({ error: "invalid_oauth_callback" }, 400);
      }

      const stateHash = await sha256(state);
      const claimed = await db<Array<{
        state_hash: string;
        user_id: string;
        tipster_id: string;
      }>>(
        `maurilio_payment_oauth_states?state_hash=eq.${encodeURIComponent(stateHash)}&user_id=eq.${encodeURIComponent(userId)}&tipster_id=eq.${encodeURIComponent(tipster.id)}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
        {
          method: "PATCH",
          body: JSON.stringify({ used_at: new Date().toISOString() }),
        },
        "return=representation",
      );

      if (!claimed[0]) {
        return reply({ error: "oauth_state_invalid_or_expired" }, 409);
      }

      const token = await exchangeCode({
        code,
        state,
        clientId: mp.clientId,
        clientSecret: mp.clientSecret,
        redirectUri: mp.redirectUri,
      });

      const expiresIn =
        Number.isFinite(token.expiresIn) && token.expiresIn > 0
          ? token.expiresIn
          : 15552000;

      const accessTokenCiphertext = await encryptValue(
        token.accessToken,
        mp.encryptionSecret,
      );
      const refreshTokenCiphertext = await encryptValue(
        token.refreshToken,
        mp.encryptionSecret,
      );

      await db(
        "maurilio_tipster_payment_accounts?on_conflict=tipster_id",
        {
          method: "POST",
          body: JSON.stringify({
            tipster_id: tipster.id,
            provider: "mercado_pago",
            provider_user_id: token.providerUserId,
            public_key: token.publicKey,
            access_token_ciphertext: accessTokenCiphertext,
            refresh_token_ciphertext: refreshTokenCiphertext,
            scope: token.scope,
            live_mode: token.liveMode,
            token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
            connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            revoked_at: null,
          }),
        },
        "resolution=merge-duplicates,return=minimal",
      );

      return reply({
        connected: true,
        provider: "mercado_pago",
        providerUserId: token.providerUserId,
        liveMode: token.liveMode,
      });
    }

    if (action === "disconnect") {
      await db(
        `maurilio_tipster_payment_accounts?tipster_id=eq.${encodeURIComponent(tipster.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            access_token_ciphertext: "revoked",
            refresh_token_ciphertext: "revoked",
            revoked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        },
        "return=minimal",
      );

      await db(
        `maurilio_tipsters?id=eq.${encodeURIComponent(tipster.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            accepting_subscribers: false,
            updated_at: new Date().toISOString(),
          }),
        },
        "return=minimal",
      );

      return reply({ connected: false, salesEnabled: false });
    }

    return reply({ error: "invalid_action" }, 400);
  } catch (error) {
    console.error("maurilio_mercadopago_connect_failed", error);
    return reply({ error: "payment_account_unavailable" }, 503);
  }
});
