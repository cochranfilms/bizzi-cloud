import type { Firestore } from "firebase-admin/firestore";
import type { DocumentSnapshot } from "firebase-admin/firestore";

/**
 * Assert uid may write (create/update files/folders) for this linked drive.
 * Mirrors high-level client rules: owner, org admin, or active team seat on owner drive.
 */
export async function assertLinkedDriveWriteAccess(
  db: Firestore,
  uid: string,
  driveSnap: DocumentSnapshot,
): Promise<void> {
  if (!driveSnap.exists) {
    throw new StorageFolderAccessError("Drive not found", 404);
  }
  const d = driveSnap.data()!;
  const ownerUid = String(d.userId ?? "");
  if (ownerUid === uid) return;

  const orgId = (d.organization_id as string | undefined) ?? null;
  if (orgId) {
    const seatId = `${orgId}_${uid}`;
    const seat = await db.collection("organization_seats").doc(seatId).get();
    if (seat.exists && (seat.data()?.role as string | undefined) === "admin") {
      return;
    }
    throw new StorageFolderAccessError("Not allowed to modify this drive", 403);
  }

  const teamOwner = (d.personal_team_owner_id as string | undefined) ?? null;
  if (
    teamOwner &&
    teamOwner === ownerUid &&
    (await teamSeatAllowsStorage(db, teamOwner, uid))
  ) {
    return;
  }

  throw new StorageFolderAccessError("Not allowed to modify this drive", 403);
}

export async function assertLinkedDriveReadAccess(
  db: Firestore,
  uid: string,
  driveSnap: DocumentSnapshot,
): Promise<void> {
  if (!driveSnap.exists) {
    throw new StorageFolderAccessError("Drive not found", 404);
  }
  const d = driveSnap.data()!;
  const ownerUid = String(d.userId ?? "");
  if (ownerUid === uid) return;

  const orgId = (d.organization_id as string | undefined) ?? null;
  if (orgId) {
    const seatId = `${orgId}_${uid}`;
    const seat = await db.collection("organization_seats").doc(seatId).get();
    if (seat.exists) return;
    throw new StorageFolderAccessError("Not allowed to view this drive", 403);
  }

  const teamOwner = (d.personal_team_owner_id as string | undefined) ?? null;
  if (
    teamOwner &&
    teamOwner === ownerUid &&
    (await teamSeatAllowsStorage(db, teamOwner, uid))
  ) {
    return;
  }

  throw new StorageFolderAccessError("Not allowed to view this drive", 403);
}

async function teamSeatAllowsStorage(
  db: Firestore,
  teamOwnerUid: string,
  memberUid: string,
): Promise<boolean> {
  const seatId = `${teamOwnerUid}_${memberUid}`;
  const seat = await db.collection("personal_team_seats").doc(seatId).get();
  if (!seat.exists) return false;
  const status = seat.data()?.status as string | undefined;
  return status === "active" || status === "cold_storage";
}

export async function assertFolderModelV2(
  driveSnap: DocumentSnapshot,
): Promise<void> {
  if (!driveSnap.exists) {
    throw new StorageFolderAccessError("Drive not found", 404);
  }
  const v = driveSnap.data()?.folder_model_version;
  if (v !== 2) {
    throw new StorageFolderAccessError(
      "Drive is not on folder model v2",
      400,
    );
  }
}

export class StorageFolderAccessError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "StorageFolderAccessError";
  }
}
