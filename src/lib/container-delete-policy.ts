/**
 * Server-side rules: who may move a backup_file to trash (soft delete) or remove it permanently.
 * Org: active seat; admins may delete any file; members only their own uploads.
 * Personal / team: linked drive owner may delete any file on that drive; otherwise uploader only.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { DocumentData } from "firebase-admin/firestore";

export class TrashForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrashForbiddenError";
  }
}

async function assertActorMayRemoveBackupFileData(
  actorUid: string,
  d: DocumentData
): Promise<void> {
  const db = getAdminFirestore();
  const uploader = (d.userId ?? d.user_id) as string;
  const orgId = (d.organization_id as string | null) ?? null;
  const driveId = (d.linked_drive_id as string) ?? "";

  if (orgId) {
    const seatSnap = await db.collection("organization_seats").doc(`${orgId}_${actorUid}`).get();
    if (!seatSnap.exists || seatSnap.data()?.status !== "active") {
      throw new TrashForbiddenError("Forbidden");
    }
    const role = seatSnap.data()?.role as string;
    if (role === "admin") return;
    if (uploader === actorUid) return;
    throw new TrashForbiddenError("Forbidden");
  }

  if (driveId) {
    const driveSnap = await db.collection("linked_drives").doc(driveId).get();
    const driveUserId = driveSnap.data()?.userId as string | undefined;
    if (driveUserId === actorUid) return;
  }

  if (uploader !== actorUid) {
    throw new TrashForbiddenError("Forbidden");
  }
}

export async function assertCanTrashBackupFile(
  actorUid: string,
  fileId: string
): Promise<void> {
  const db = getAdminFirestore();
  const f = await db.collection("backup_files").doc(fileId).get();
  if (!f.exists) {
    throw new TrashForbiddenError("File not found");
  }
  const d = f.data()!;
  if (d.deleted_at) {
    throw new TrashForbiddenError("Already deleted");
  }
  await assertActorMayRemoveBackupFileData(actorUid, d);
}

/** Same roles as trash, without requiring the file to be active (used for permanent delete). */
export async function assertMayRemoveBackupFile(
  actorUid: string,
  fileId: string
): Promise<void> {
  const db = getAdminFirestore();
  const f = await db.collection("backup_files").doc(fileId).get();
  if (!f.exists) {
    throw new TrashForbiddenError("File not found");
  }
  await assertActorMayRemoveBackupFileData(actorUid, f.data()!);
}
