/**
 * LAYER 3: Application-Level Encryption
 *
 * Encrypts sensitive metadata (API tokens, credentials, recovery codes, private notes)
 * before storing in Firestore. Uses AES-256-GCM with random IV per operation.
 *
 * Key management: Use APP_ENCRYPTION_KEY_CURRENT and optional APP_ENCRYPTION_KEY_PREVIOUS
 * for rotation. Payload format: base64(v|iv|ciphertext|authTag).
 *
 * @see docs/ENCRYPTION_ARCHITECTURE.md
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;
const KEY_LEN = 32;
const PREFIX = "bizzi:"; // Payload format identifier

type KeyVersion = number;

function getCurrentKey(): { key: Buffer; version: KeyVersion } {
  const raw = process.env.APP_ENCRYPTION_KEY_CURRENT;
  if (!raw || typeof raw !== "string") {
    throw new Error(
      "APP_ENCRYPTION_KEY_CURRENT is not set. Generate a 32-byte hex key: openssl rand -hex 32"
    );
  }
  const key = Buffer.from(raw.replace(/^0x/, ""), "hex");
  if (key.length !== KEY_LEN) {
    throw new Error(`APP_ENCRYPTION_KEY_CURRENT must be ${KEY_LEN} bytes (64 hex chars)`);
  }
  const version = parseInt(process.env.APP_ENCRYPTION_KEY_VERSION ?? "1", 10);
  return { key, version };
}

function getKeyByVersion(version: KeyVersion): Buffer {
  if (version === parseInt(process.env.APP_ENCRYPTION_KEY_VERSION ?? "1", 10)) {
    return getCurrentKey().key;
  }
  const prev = process.env.APP_ENCRYPTION_KEY_PREVIOUS;
  if (prev && typeof prev === "string") {
    const key = Buffer.from(prev.replace(/^0x/, ""), "hex");
    if (key.length === KEY_LEN) return key;
  }
  throw new Error(`Encryption key for version ${version} not available`);
}

/**
 * Encrypt a sensitive string. Returns compact payload: bizzi:v:base64(iv|ciphertext|authTag)
 */
export function encryptField(value: string): string {
  if (typeof value !== "string") {
    throw new Error("encryptField requires a string");
  }
  const { key, version } = getCurrentKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, enc, authTag]).toString("base64");
  return `${PREFIX}${version}:${payload}`;
}

/**
 * Decrypt a payload. Supports key rotation by reading version from payload.
 */
export function decryptField(payload: string): string {
  if (typeof payload !== "string" || !payload.startsWith(PREFIX)) {
    throw new Error("Invalid encrypted payload format");
  }
  const rest = payload.slice(PREFIX.length);
  const colon = rest.indexOf(":");
  if (colon < 0) throw new Error("Invalid encrypted payload: missing version");
  const version = parseInt(rest.slice(0, colon), 10);
  const b64 = rest.slice(colon + 1);
  const key = getKeyByVersion(version as KeyVersion);
  const buf = Buffer.from(b64, "base64");
  if (buf.length < IV_LEN + AUTH_TAG_LEN) {
    throw new Error("Encrypted payload too short");
  }
  const iv = buf.subarray(0, IV_LEN);
  const authTag = buf.subarray(buf.length - AUTH_TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN, buf.length - AUTH_TAG_LEN);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

/**
 * Check if a value looks like an encrypted payload (without decrypting).
 */
export function isEncryptedPayload(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * Encrypt specified fields in an object. Only encrypts if value is string and not already encrypted.
 */
export function maybeEncryptObjectFields<T extends Record<string, unknown>>(
  data: T,
  fieldList: (keyof T)[]
): T {
  if (!process.env.APP_ENCRYPTION_KEY_CURRENT) {
    return data;
  }
  const out = { ...data };
  for (const field of fieldList) {
    const val = out[field];
    if (typeof val === "string" && val.length > 0 && !isEncryptedPayload(val)) {
      try {
        (out as Record<string, unknown>)[field as string] = encryptField(val);
      } catch {
        // Skip if encryption fails (e.g. missing key)
      }
    }
  }
  return out;
}

/**
 * Decrypt specified fields in an object. Only decrypts if value looks like encrypted payload.
 */
export function maybeDecryptObjectFields<T extends Record<string, unknown>>(
  data: T,
  fieldList: (keyof T)[]
): T {
  const out = { ...data };
  for (const field of fieldList) {
    const val = out[field];
    if (isEncryptedPayload(val)) {
      try {
        (out as Record<string, unknown>)[field as string] = decryptField(val);
      } catch {
        // Keep encrypted if decryption fails (e.g. key rotated, record uses old key)
      }
    }
  }
  return out;
}
