import type { User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";

const QUOTA_COOLDOWN_MS = 90_000;
let quotaCooldownUntilMs = 0;

export function isFirebaseAuthQuotaExceededError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "auth/quota-exceeded"
  );
}

/** After quota-exceeded, skip forced refreshes briefly to stop retry storms and UI flicker. */
export function registerFirebaseAuthQuotaCooldown(): void {
  quotaCooldownUntilMs = Date.now() + QUOTA_COOLDOWN_MS;
}

export function isFirebaseAuthQuotaCooldownActive(): boolean {
  return Date.now() < quotaCooldownUntilMs;
}

/**
 * ID token fetch with optional force refresh. During quota cooldown, force refresh is suppressed
 * so parallel uploads / polling do not hammer the token endpoint after a limit is hit.
 */
export async function getUserIdToken(
  user: User,
  forceRefresh = false
): Promise<string> {
  const wantForce = forceRefresh && !isFirebaseAuthQuotaCooldownActive();
  try {
    return await user.getIdToken(wantForce);
  } catch (e) {
    if (isFirebaseAuthQuotaExceededError(e)) {
      registerFirebaseAuthQuotaCooldown();
      return await user.getIdToken(false);
    }
    throw e;
  }
}

export async function getCurrentUserIdToken(
  forceRefresh = false
): Promise<string | null> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return null;
  return getUserIdToken(user, forceRefresh);
}

/**
 * Returns the current Firebase ID token.
 * @param forceRefresh - When false (default for read/thumbnail ops), returns the cached token
 *   without forcing a refresh. This avoids hammering securetoken.googleapis.com when many
 *   parallel requests (e.g. thumbnails, multipart upload steps) all need a token.
 *   Use true for user-initiated writes where claims may have just changed.
 */
export async function getAuthToken(forceRefresh = false): Promise<string | null> {
  return getCurrentUserIdToken(forceRefresh);
}
