import { getAdminFirestore } from "@/lib/firebase-admin";
import { userCanAccessWorkspace } from "@/lib/workspace-access";

/**
 * Verifies that a user has access to a backup file by ID.
 * Used for comments, hearts, and collaboration features.
 * Checks: ownership, org admin, workspace membership, share access (invited_emails).
 */
export async function canAccessBackupFileById(
  uid: string,
  fileId: string,
  userEmail?: string
): Promise<boolean> {
  const db = getAdminFirestore();
  const fileSnap = await db.collection("backup_files").doc(fileId).get();
  if (!fileSnap.exists) return false;

  const fileData = fileSnap.data();
  if (fileData?.deleted_at) return false;

  // Owner
  if (fileData?.userId === uid) return true;

  // Org admin (same logic as backup_files rules)
  const orgId = fileData?.organization_id as string | undefined;
  if (orgId) {
    const seatSnap = await db.collection("organization_seats").doc(`${orgId}_${uid}`).get();
    if (seatSnap.exists && seatSnap.data()?.role === "admin") return true;
  }

  // Workspace-based access: file in org workspace user can access
  const workspaceId = fileData?.workspace_id as string | undefined;
  if (workspaceId && orgId) {
    if (await userCanAccessWorkspace(uid, workspaceId)) return true;
  }

  // Share access: folder_shares where this file is shared and user is invited
  const linkedDriveId = fileData?.linked_drive_id as string | undefined;
  const ownerId = fileData?.userId as string;

  // Virtual share: referenced_file_ids contains this fileId
  const sharesByRefSnap = await db
    .collection("folder_shares")
    .where("referenced_file_ids", "array-contains", fileId)
    .limit(20)
    .get();

  for (const d of sharesByRefSnap.docs) {
    const data = d.data();
    if (data.owner_id !== ownerId) continue;
    const expiresAt = data.expires_at?.toDate?.();
    if (expiresAt && expiresAt < new Date()) continue;
    if (data.access_level === "public") return true;
    if (userEmail && Array.isArray(data.invited_emails)) {
      if (data.invited_emails.some((e: string) => e?.toLowerCase() === userEmail.toLowerCase()))
        return true;
    }
  }

  // Single file share: backup_file_id
  const sharesByFileSnap = await db
    .collection("folder_shares")
    .where("owner_id", "==", ownerId)
    .where("backup_file_id", "==", fileId)
    .limit(5)
    .get();

  for (const d of sharesByFileSnap.docs) {
    const data = d.data();
    const expiresAt = data.expires_at?.toDate?.();
    if (expiresAt && expiresAt < new Date()) continue;
    if (data.access_level === "public") return true;
    if (userEmail && Array.isArray(data.invited_emails)) {
      if (data.invited_emails.some((e: string) => e?.toLowerCase() === userEmail.toLowerCase()))
        return true;
    }
  }

  // Folder share: linked_drive_id matches
  if (linkedDriveId) {
    const sharesByDriveSnap = await db
      .collection("folder_shares")
      .where("owner_id", "==", ownerId)
      .where("linked_drive_id", "==", linkedDriveId)
      .where("backup_file_id", "==", null)
      .limit(5)
      .get();

    for (const d of sharesByDriveSnap.docs) {
      const data = d.data();
      const expiresAt = data.expires_at?.toDate?.();
      if (expiresAt && expiresAt < new Date()) continue;
      if (data.access_level === "public") return true;
      if (userEmail && Array.isArray(data.invited_emails)) {
        if (data.invited_emails.some((e: string) => e?.toLowerCase() === userEmail.toLowerCase()))
          return true;
      }
    }
  }

  return false;
}

/**
 * Get file display name for notifications.
 */
export async function getFileDisplayName(fileId: string): Promise<string> {
  const db = getAdminFirestore();
  const fileSnap = await db.collection("backup_files").doc(fileId).get();
  if (!fileSnap.exists) return "a file";
  const path = (fileSnap.data()?.relative_path ?? "") as string;
  return path.split("/").filter(Boolean).pop() ?? "a file";
}

/**
 * Get display names for multiple files. Returns up to maxNames, then "and X more" if truncated.
 */
export async function getFileDisplayNames(
  fileIds: string[],
  maxNames = 10
): Promise<string[]> {
  const names: string[] = [];
  for (const id of fileIds.slice(0, maxNames)) {
    names.push(await getFileDisplayName(id));
  }
  return names;
}
