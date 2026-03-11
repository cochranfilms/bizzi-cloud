import { getFirebaseAuth } from "@/lib/firebase/client";

/**
 * Returns the current Firebase ID token.
 * @param forceRefresh - When false (default for read/thumbnail ops), returns the cached token
 *   without forcing a refresh. This avoids hammering securetoken.googleapis.com when many
 *   parallel requests (e.g. thumbnails) all need a token.
 *   Use true for user-initiated writes (share, checkout, etc.) to ensure a fresh token.
 */
export async function getAuthToken(forceRefresh = false): Promise<string | null> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}
