import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { envValue } from "./env.js";

const AUTH_COOKIE = "lam_admin_session";
export const ADMIN_STORAGE_KEY = "lam_admin_auth";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function sessionSecret(): string {
  return (
    envValue("ADMIN_SESSION_SECRET") ||
    envValue("ADMIN_PASSWORD_HASH") ||
    envValue("ADMIN_PASSWORD") ||
    "live-app-manager-dev-admin-secret"
  );
}

/** SHA-256 hex digest for optional ADMIN_PASSWORD_HASH storage. */
export function hashPassword(password: string): string {
  return createHash("sha256").update(password, "utf8").digest("hex");
}

export function verifyAdminCredentials(
  email: string,
  password: string,
): boolean {
  const expectedEmail = envValue("ADMIN_EMAIL");
  if (!expectedEmail) return false;
  if (!safeEqual(email.trim().toLowerCase(), expectedEmail.trim().toLowerCase())) {
    return false;
  }

  const passwordHash = envValue("ADMIN_PASSWORD_HASH");
  if (passwordHash) {
    const digest = hashPassword(password);
    const expected = passwordHash.trim().toLowerCase();
    return safeEqual(digest.toLowerCase(), expected);
  }

  const plain = envValue("ADMIN_PASSWORD");
  if (plain) {
    return safeEqual(password, plain);
  }

  return false;
}

export function issueAdminToken(email: string): string {
  const issuedAt = Date.now().toString();
  const payload = `${email.trim().toLowerCase()}|${issuedAt}`;
  const sig = createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}

export function verifyAdminToken(token: string | undefined | null): boolean {
  if (!token) return false;
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parts = raw.split("|");
    if (parts.length !== 3) return false;
    const [email, issuedAt, sig] = parts;
    if (!email || !issuedAt || !sig) return false;

    const expectedEmail = envValue("ADMIN_EMAIL");
    if (!expectedEmail) return false;
    if (!safeEqual(email, expectedEmail.trim().toLowerCase())) return false;

    const payload = `${email}|${issuedAt}`;
    const expectedSig = createHmac("sha256", sessionSecret())
      .update(payload)
      .digest("hex");
    if (!safeEqual(sig, expectedSig)) return false;

    // 7-day session
    const age = Date.now() - Number(issuedAt);
    if (!Number.isFinite(age) || age < 0 || age > 7 * 24 * 60 * 60 * 1000) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export { AUTH_COOKIE };
