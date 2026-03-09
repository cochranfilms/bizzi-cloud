/**
 * Client session for email-gate access (no Firebase Auth required).
 * Invited clients enter their email; we verify it against gallery invited_emails
 * and create a signed session cookie.
 */
import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "bizzi_client_session";
const COOKIE_MAX_AGE_DAYS = 30;
const ALGORITHM = "sha256";

function getSecret(): string {
  const secret = process.env.CLIENT_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "CLIENT_SESSION_SECRET must be set and at least 32 characters for client email sessions"
    );
  }
  return secret;
}

/** Create a signed session token for the given email. */
export function createClientSessionToken(email: string): string {
  const secret = getSecret();
  const normalized = email.trim().toLowerCase();
  const expiry = Date.now() + COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${normalized}|${expiry}`;
  const sig = createHmac(ALGORITHM, secret).update(payload).digest("hex");
  const raw = `${payload}|${sig}`;
  return Buffer.from(raw).toString("base64url");
}

/** Verify token and return email if valid. */
export function verifyClientSessionToken(token: string): string | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parts = raw.split("|");
    if (parts.length !== 3) return null;
    const [email, expiryStr, sig] = parts;
    const expiry = parseInt(expiryStr, 10);
    if (isNaN(expiry) || expiry < Date.now()) return null;
    const payload = `${email}|${expiryStr}`;
    const expected = createHmac(ALGORITHM, getSecret()).update(payload).digest("hex");
    if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) {
      return null;
    }
    return email.trim().toLowerCase();
  } catch {
    return null;
  }
}

/** Parse client session from Cookie header. */
export function getClientEmailFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const token = match?.[1]?.trim();
  if (!token) return null;
  return verifyClientSessionToken(token);
}

export function getClientSessionCookieName(): string {
  return COOKIE_NAME;
}

/** Build Set-Cookie header value for the session. */
export function buildSessionCookie(token: string): string {
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

/** Build Set-Cookie header to clear the session. */
export function buildClearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}
