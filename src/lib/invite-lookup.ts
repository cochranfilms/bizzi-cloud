import type { Firestore } from "firebase-admin/firestore";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { hashInviteToken } from "@/lib/invite-token";

/**
 * Find a pending organization seat by invite token.
 * Supports both invite_token_hash (new) and invite_token (legacy) for backward compatibility.
 */
export async function findPendingSeatByToken(
  db: Firestore,
  token: string
): Promise<QueryDocumentSnapshot | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  // New: query by hash
  const tokenHash = hashInviteToken(trimmed);
  const hashSnap = await db
    .collection("organization_seats")
    .where("invite_token_hash", "==", tokenHash)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (!hashSnap.empty) {
    return hashSnap.docs[0];
  }

  // Legacy: query by plain token (for existing invites created before hashing)
  const legacySnap = await db
    .collection("organization_seats")
    .where("invite_token", "==", trimmed)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (!legacySnap.empty) {
    return legacySnap.docs[0];
  }

  return null;
}
