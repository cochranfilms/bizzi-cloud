/**
 * Lifecycle-aware byte totals for storage quota and display.
 * Prefer these helpers over ad-hoc deleted_at checks.
 */

import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { isBackupFileActiveForListing } from "@/lib/backup-file-lifecycle";

/** Sum size_bytes for docs in a snapshot where the file is actively listed (not trashed/etc.). */
export function sumActiveBytesFromSnapshot(docs: QueryDocumentSnapshot[]): number {
  let n = 0;
  for (const docSnap of docs) {
    const data = docSnap.data() as Record<string, unknown>;
    if (!isBackupFileActiveForListing(data)) continue;
    n += typeof data.size_bytes === "number" ? data.size_bytes : 0;
  }
  return n;
}

/** Active org-scoped backup bytes (shared org pool). */
export async function sumActiveOrgBackupBytes(
  db: Firestore,
  orgId: string
): Promise<number> {
  const snap = await db
    .collection("backup_files")
    .where("organization_id", "==", orgId)
    .get();
  return sumActiveBytesFromSnapshot(snap.docs);
}

export async function sumActiveOrgBackupBytesDefault(orgId: string): Promise<number> {
  return sumActiveOrgBackupBytes(getAdminFirestore(), orgId);
}

/** Per-seat org upload totals: user's files in that org (active only). */
export async function sumActiveUserOrgBackupBytes(
  db: Firestore,
  userId: string,
  orgId: string
): Promise<number> {
  const snap = await db
    .collection("backup_files")
    .where("userId", "==", userId)
    .where("organization_id", "==", orgId)
    .get();
  return sumActiveBytesFromSnapshot(snap.docs);
}

/** Per-member personal-team uploads: this user's files in the owner's team container. */
export async function sumActiveUserPersonalTeamBackupBytes(
  db: Firestore,
  userId: string,
  teamOwnerUid: string
): Promise<number> {
  const snap = await db
    .collection("backup_files")
    .where("userId", "==", userId)
    .where("personal_team_owner_id", "==", teamOwnerUid)
    .where("organization_id", "==", null)
    .get();
  return sumActiveBytesFromSnapshot(snap.docs);
}
