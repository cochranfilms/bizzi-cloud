import type { Firestore } from "firebase-admin/firestore";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { findPendingOrgInviteByToken } from "@/lib/organization-invites";

/**
 * Find pending org membership by invite token (organization_invites; legacy organization_seats pending supported).
 */
export async function findPendingSeatByToken(
  db: Firestore,
  token: string
): Promise<QueryDocumentSnapshot | null> {
  return findPendingOrgInviteByToken(db, token);
}
