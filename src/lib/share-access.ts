import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";

export type ShareAccessResult =
  | { allowed: true }
  | { allowed: false; code: "private_share_requires_auth"; message: string }
  | { allowed: false; code: "access_denied"; message: string };

/**
 * Verify that the visitor has access to a share.
 * - Public shares: anyone can access.
 * - Private shares: only owner or invited_emails (requires auth).
 */
export async function verifyShareAccess(
  share: { owner_id: string; access_level?: string; invited_emails?: string[] },
  authHeader: string | null
): Promise<ShareAccessResult> {
  const accessLevel = share.access_level ?? "public";

  if (accessLevel === "public") {
    return { allowed: true };
  }

  // Private: require auth
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      allowed: false,
      code: "private_share_requires_auth",
      message: "This folder is private. Sign in to access if you have been invited.",
    };
  }

  const token = authHeader.slice(7).trim();
  let uid: string;
  let email: string | undefined;

  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email;
  } catch {
    return {
      allowed: false,
      code: "private_share_requires_auth",
      message: "Invalid or expired session. Please sign in again.",
    };
  }

  if (uid === share.owner_id) {
    return { allowed: true };
  }

  const invited = share.invited_emails ?? [];
  const emailLower = email?.toLowerCase();
  if (emailLower && invited.some((e: string) => e.toLowerCase() === emailLower)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    code: "access_denied",
    message: "You don't have access to this folder.",
  };
}
