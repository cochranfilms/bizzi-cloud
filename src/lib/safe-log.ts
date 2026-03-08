/**
 * LAYER 9: Safe Logging
 *
 * Redact tokens, passwords, keys, and signed URLs from logs.
 * Never log raw secrets or decrypted sensitive values.
 */

const REDACT = "[REDACTED]";

const PATTERNS = [
  /password["']?\s*[:=]\s*["']?[^"'\s]+/gi,
  /token["']?\s*[:=]\s*["']?[^"'\s]+/gi,
  /secret["']?\s*[:=]\s*["']?[^"'\s]+/gi,
  /api[_-]?key["']?\s*[:=]\s*["']?[^"'\s]+/gi,
  /authorization["']?\s*[:=]\s*["']?bearer\s+[^\s"']+/gi,
  /cookie["']?\s*[:=]\s*["']?[^"'\s]+/gi,
  /\b[A-Za-z0-9_-]{20,}\.ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, // JWT-like
  /(?:https?:\/\/[^\s"']*)[?&](?:X-Amz|sig|signature|token)=[^\s&"']+/gi,
];

/**
 * Redact sensitive values from a string. Safe to pass any string.
 */
export function redact(str: string): string {
  if (typeof str !== "string") return REDACT;
  let out = str;
  for (const re of PATTERNS) {
    out = out.replace(re, (m) => {
      const eq = m.indexOf("=");
      if (eq >= 0) {
        return m.slice(0, eq + 1) + `"${REDACT}"`;
      }
      return REDACT;
    });
  }
  return out;
}

/**
 * Redact known keys in an object. Returns new object; does not mutate.
 */
export function redactObject<T extends Record<string, unknown>>(
  obj: T,
  extraKeys: string[] = []
): Record<string, unknown> {
  const SENSITIVE_KEYS = new Set([
    "password",
    "password_hash",
    "pin",
    "pin_hash",
    "token",
    "secret",
    "apiKey",
    "api_key",
    "authorization",
    "cookie",
    "private_key",
    ...extraKeys,
  ]);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const keyLower = k.toLowerCase();
    if (SENSITIVE_KEYS.has(keyLower) || SENSITIVE_KEYS.has(k)) {
      out[k] = v != null && String(v).length > 0 ? REDACT : v;
    } else if (v && typeof v === "object" && !Array.isArray(v) && !Buffer.isBuffer(v)) {
      out[k] = redactObject(v as Record<string, unknown>, extraKeys);
    } else if (typeof v === "string") {
      out[k] = redact(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Safe string for logging: truncate and redact URLs that may contain tokens.
 */
export function safeForLog(value: unknown, maxLen = 100): string {
  if (value == null) return String(value);
  const s = String(value);
  if (s.length <= maxLen) return redact(s);
  return redact(s.slice(0, maxLen)) + "...";
}
