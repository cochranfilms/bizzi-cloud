import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const k = process.env.MIGRATION_TOKEN_ENCRYPTION_KEY?.trim();
  if (!k) {
    throw new Error("MIGRATION_TOKEN_ENCRYPTION_KEY is not configured");
  }
  if (/^[0-9a-f]{64}$/i.test(k)) {
    return Buffer.from(k, "hex");
  }
  const b = Buffer.from(k, "base64");
  if (b.length !== 32) {
    throw new Error("MIGRATION_TOKEN_ENCRYPTION_KEY must be 32 bytes (hex 64 chars or base64)");
  }
  return b;
}

/** Encrypt for storage in Firestore. Format: base64(iv|tag|ciphertext). */
export function encryptMigrationSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptMigrationSecret(blob: string): string {
  const key = getKey();
  const raw = Buffer.from(blob, "base64url");
  if (raw.length < 12 + 16) {
    throw new Error("Invalid encrypted payload");
  }
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
