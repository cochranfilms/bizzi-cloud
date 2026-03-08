import { createHash } from "crypto";

/**
 * Hash invite token for storage. We never store the plain token - only the hash.
 * Lookup: hash(user-provided-token) and query by invite_token_hash.
 * Uses SHA-256 (deterministic, fast, sufficient for random UUID tokens).
 */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}
