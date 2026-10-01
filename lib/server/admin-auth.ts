import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "maurilio_admin";
const MAX_AGE_SECONDS = 60 * 60 * 8;

function secret() {
  const value = process.env.MAURILIO_ADMIN_SECRET;
  if (!value || value.length < 24) return null;
  return value;
}

export function adminConfigured() {
  return Boolean(secret());
}

function sign(value: string) {
  const key = secret();
  if (!key) throw new Error("admin_not_configured");
  return createHmac("sha256", key).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyAdminSecret(candidate: string) {
  const key = secret();
  if (!key) return false;
  return safeEqual(candidate, key);
}

export function createAdminSession(now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + MAX_AGE_SECONDS;
  const payload = Buffer.from(
    JSON.stringify({ exp: expiresAt, scope: "maurilio:admin" }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminSession(token: string | undefined, now = Date.now()) {
  if (!token || !secret()) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;

  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return false;
  }
  if (!safeEqual(signature, expected)) return false;

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { exp?: unknown; scope?: unknown };

    return (
      parsed.scope === "maurilio:admin" &&
      typeof parsed.exp === "number" &&
      parsed.exp > Math.floor(now / 1000)
    );
  } catch {
    return false;
  }
}

export function adminCookieMaxAge() {
  return MAX_AGE_SECONDS;
}
