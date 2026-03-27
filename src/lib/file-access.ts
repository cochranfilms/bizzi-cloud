import { getAdminFirestore } from "@/lib/firebase-admin";
import {
  PERSONAL_TEAM_SEATS_COLLECTION,
  personalTeamSeatDocId,
} from "@/lib/personal-team-constants";
import { MACOS_PACKAGE_CONTAINERS_COLLECTION } from "@/lib/macos-package-container-admin";
import { parseMacosPackageIdFromSyntheticFileId } from "@/lib/macos-package-synthetic-id";
import { userCanAccessWorkspace } from "@/lib/workspace-access";

function personalTeamSeatAllowsAccess(status: string | undefined): boolean {
  return status === "active" || status === "cold_storage";
}

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

  // Personal team: owner always has access (members upload with userId = member)
  if (!fileData?.organization_id) {
    const pto = fileData?.personal_team_owner_id as string | undefined;
    if (pto && pto === uid) return true;

    const linkedDriveIdEarly = fileData?.linked_drive_id as string | undefined;
    if (linkedDriveIdEarly) {
      const driveSnap = await db.collection("linked_drives").doc(linkedDriveIdEarly).get();
      const driveData = driveSnap.data();
      const driveTeamOwner = driveData?.personal_team_owner_id as string | undefined;
      if (driveTeamOwner && driveData?.userId === driveTeamOwner) {
        if (uid === driveTeamOwner) return true;
        const seatSnap = await db
          .collection(PERSONAL_TEAM_SEATS_COLLECTION)
          .doc(personalTeamSeatDocId(driveTeamOwner, uid))
          .get();
        const st = seatSnap.data()?.status as string | undefined;
        if (seatSnap.exists && personalTeamSeatAllowsAccess(st)) return true;
      }
    }

    if (pto) {
      const seatSnap = await db
        .collection(PERSONAL_TEAM_SEATS_COLLECTION)
        .doc(personalTeamSeatDocId(pto, uid))
        .get();
      const st = seatSnap.data()?.status as string | undefined;
      if (seatSnap.exists && personalTeamSeatAllowsAccess(st)) return true;
    }
  }

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

export {
  MACOS_PACKAGE_SYNTHETIC_FILE_ID_PREFIX,
  isMacosPackageSyntheticFileId,
  parseMacosPackageIdFromSyntheticFileId,
} from "@/lib/macos-package-synthetic-id";

/** Any non-deleted backup_files row linked to the package (for access + owner). */
export async function getAnchorBackupFileIdForMacosPackage(
  packageId: string
): Promise<string | null> {
  const db = getAdminFirestore();
  const snap = await db
    .collection("backup_files")
    .where("macos_package_id", "==", packageId)
    .where("deleted_at", "==", null)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

export type CollaborationFileContext =
  | { ok: true; collabFileId: string; anchorBackupFileId: string }
  | { ok: false };

/**
 * Maps URL/API file id to a real backup_files doc for permissions + metadata.
 * Synthetic macOS package ids reuse hearts/comments keyed by the synthetic id.
 */
export async function resolveCollaborationFileContext(
  uid: string,
  fileId: string,
  userEmail?: string
): Promise<CollaborationFileContext> {
  const pkgId = parseMacosPackageIdFromSyntheticFileId(fileId);
  if (pkgId) {
    const anchor = await getAnchorBackupFileIdForMacosPackage(pkgId);
    if (!anchor) return { ok: false };
    const can = await canAccessBackupFileById(uid, anchor, userEmail);
    if (!can) return { ok: false };
    return { ok: true, collabFileId: fileId, anchorBackupFileId: anchor };
  }
  const can = await canAccessBackupFileById(uid, fileId, userEmail);
  if (!can) return { ok: false };
  return { ok: true, collabFileId: fileId, anchorBackupFileId: fileId };
}

export async function getCollaborationFileDisplayName(
  collabFileId: string,
  anchorBackupFileId: string
): Promise<string> {
  if (collabFileId === anchorBackupFileId) {
    return getFileDisplayName(anchorBackupFileId);
  }
  const pkgId = parseMacosPackageIdFromSyntheticFileId(collabFileId);
  if (!pkgId) return getFileDisplayName(anchorBackupFileId);
  const db = getAdminFirestore();
  const cs = await db.collection(MACOS_PACKAGE_CONTAINERS_COLLECTION).doc(pkgId).get();
  if (cs.exists) {
    const d = cs.data();
    const seg = (d?.root_segment_name as string | undefined)?.trim();
    if (seg) return seg;
    const root = (d?.root_relative_path as string) ?? "";
    const base = root.split("/").filter(Boolean).pop();
    if (base) return base;
  }
  return getFileDisplayName(anchorBackupFileId);
}

/** File list / recent-open row for either a backup_files id or a synthetic package id. */
export async function hydrateCollaborationFileForApiResponse(
  uid: string,
  userEmail: string | undefined,
  collabFileId: string,
  driveNameCache?: Map<string, string>
): Promise<{
  id: string;
  name: string;
  path: string;
  objectKey: string;
  size: number;
  modifiedAt: string | null;
  driveId: string;
  driveName: string;
  contentType: string | null;
  galleryId: string | null;
  assetType?: string | null;
  macosPackageId?: string | null;
} | null> {
  const ctx = await resolveCollaborationFileContext(uid, collabFileId, userEmail);
  if (!ctx.ok) return null;

  const db = getAdminFirestore();
  const cache = driveNameCache ?? new Map<string, string>();

  async function driveNameFor(id: string): Promise<string> {
    if (!id) return "Unknown";
    const hit = cache.get(id);
    if (hit) return hit;
    const driveSnap = await db.collection("linked_drives").doc(id).get();
    const n = driveSnap.exists ? (driveSnap.data()?.name as string) ?? "Unknown drive" : "Unknown";
    cache.set(id, n);
    return n;
  }

  if (ctx.collabFileId === ctx.anchorBackupFileId) {
    const fileSnap = await db.collection("backup_files").doc(ctx.anchorBackupFileId).get();
    if (!fileSnap.exists) return null;
    const data = fileSnap.data()!;
    if (data.deleted_at) return null;
    const path = (data.relative_path as string) ?? "";
    const name = path.split("/").filter(Boolean).pop() ?? path ?? "?";
    const driveId = (data.linked_drive_id as string) ?? "";
    return {
      id: fileSnap.id,
      name,
      path,
      objectKey: (data.object_key as string) ?? "",
      size: Number(data.size_bytes ?? 0),
      modifiedAt:
        data.modified_at != null
          ? typeof data.modified_at === "string"
            ? data.modified_at
            : (data.modified_at as { toDate?: () => Date }).toDate?.()?.toISOString?.() ?? null
          : null,
      driveId,
      driveName: await driveNameFor(driveId),
      contentType: (data.content_type as string) ?? null,
      galleryId: (data.gallery_id as string) ?? null,
    };
  }

  const pkgId = parseMacosPackageIdFromSyntheticFileId(ctx.collabFileId)!;
  const cref = await db.collection(MACOS_PACKAGE_CONTAINERS_COLLECTION).doc(pkgId).get();
  if (!cref.exists) return null;
  const cd = cref.data()!;
  const anchorSnap = await db.collection("backup_files").doc(ctx.anchorBackupFileId).get();
  if (!anchorSnap.exists) return null;
  const ad = anchorSnap.data()!;
  if (ad.deleted_at) return null;

  const rootPath = (cd.root_relative_path as string) ?? "";
  const name =
    ((cd.root_segment_name as string) ?? "").trim() ||
    rootPath.split("/").filter(Boolean).pop() ||
    "?";
  const driveId = (cd.linked_drive_id as string) ?? (ad.linked_drive_id as string) ?? "";
  const lastAct = cd.last_activity_at;
  const modifiedAt =
    lastAct != null
      ? typeof lastAct === "string"
        ? lastAct
        : (lastAct as { toDate?: () => Date }).toDate?.()?.toISOString?.() ?? null
      : ad.modified_at != null
        ? typeof ad.modified_at === "string"
          ? ad.modified_at
          : (ad.modified_at as { toDate?: () => Date }).toDate?.()?.toISOString?.() ?? null
        : null;

  return {
    id: ctx.collabFileId,
    name,
    path: rootPath,
    objectKey: "",
    size: Number(cd.total_bytes ?? 0),
    modifiedAt,
    driveId,
    driveName: await driveNameFor(driveId),
    contentType: null,
    galleryId: null,
    assetType: "macos_package",
    macosPackageId: pkgId,
  };
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
