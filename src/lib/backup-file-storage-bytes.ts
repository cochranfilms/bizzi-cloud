/**
 * Quota-aware byte totals from backup_files (trash and pending purge count until docs are removed).
 * Prefer these helpers over ad-hoc deleted_at checks for enforcement and cached profile totals.
 */

import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { quotaCountedSizeBytesFromBackupFile } from "@/lib/backup-file-lifecycle";

/** Sum quota-counted `size_bytes` for docs in a snapshot. */
export function sumQuotaCountedBytesFromSnapshot(docs: QueryDocumentSnapshot[]): number {
  let n = 0;
  for (const docSnap of docs) {
    const data = docSnap.data() as Record<string, unknown>;
    n += quotaCountedSizeBytesFromBackupFile(data);
  }
  return n;
}

/** Org-scoped bytes that count toward the shared org pool quota. */
export async function sumQuotaCountedOrgBackupBytes(
  db: Firestore,
  orgId: string
): Promise<number> {
  const snap = await db
    .collection("backup_files")
    .where("organization_id", "==", orgId)
    .get();
  return sumQuotaCountedBytesFromSnapshot(snap.docs);
}

export async function sumQuotaCountedOrgBackupBytesDefault(orgId: string): Promise<number> {
  return sumQuotaCountedOrgBackupBytes(getAdminFirestore(), orgId);
}

/** Per-seat org totals: this user's files in that org (quota-counted). */
export async function sumQuotaCountedUserOrgBackupBytes(
  db: Firestore,
  userId: string,
  orgId: string
): Promise<number> {
  const snap = await db
    .collection("backup_files")
    .where("userId", "==", userId)
    .where("organization_id", "==", orgId)
    .get();
  return sumQuotaCountedBytesFromSnapshot(snap.docs);
}

/** Personal-team container: this user's files in the owner's team (quota-counted). */
export async function sumQuotaCountedUserPersonalTeamBackupBytes(
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
  return sumQuotaCountedBytesFromSnapshot(snap.docs);
}
