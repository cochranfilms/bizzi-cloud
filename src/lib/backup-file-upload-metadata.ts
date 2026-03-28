/**
 * Resolves denormalized container / uploader fields when creating backup_files server-side.
 *
 * Scope rule: **drive / request context wins** — `profiles.personal_team_owner_id` is not used
 * to choose team vs personal. Team scope comes from `linked_drives.personal_team_owner_id` or,
 * when that field is missing on a legacy row, from **drive `userId` + an enterable seat** for
 * the uploader (same owner as team).
 */
import type { Firestore } from "firebase-admin/firestore";
import {
  PERSONAL_TEAM_SEATS_COLLECTION,
  personalTeamSeatDocId,
} from "@/lib/personal-team-constants";
import { seatStatusAllowsEnter } from "@/lib/personal-team-seat-visibility";

export type BackupFileContainerType = "personal" | "organization" | "personal_team";

export type ResolvedBackupUploadMetadata = {
  uploaderEmail: string | null;
  containerType: BackupFileContainerType | null;
  containerId: string | null;
  personalTeamOwnerId: string | null;
  roleAtUpload: string | null;
};

async function resolvePersonalTeamFromOwner(
  db: Firestore,
  uid: string,
  teamOwner: string,
  uploaderEmail: string | null
): Promise<ResolvedBackupUploadMetadata> {
  const seatSnap = await db
    .collection(PERSONAL_TEAM_SEATS_COLLECTION)
    .doc(personalTeamSeatDocId(teamOwner, uid))
    .get();
  const seatData = seatSnap.data();
  const role = seatSnap.exists
    ? ((seatData?.seat_access_level as string) ?? "member")
    : teamOwner === uid
      ? "admin"
      : null;
  return {
    uploaderEmail,
    containerType: "personal_team",
    containerId: teamOwner,
    personalTeamOwnerId: teamOwner,
    roleAtUpload: role,
  };
}

export async function resolveBackupUploadMetadata(
  db: Firestore,
  input: {
    uid: string;
    authEmail?: string | null;
    profileData: Record<string, unknown> | undefined;
    driveData: Record<string, unknown> | undefined;
    organizationId: string | null;
  }
): Promise<ResolvedBackupUploadMetadata> {
  const { uid, authEmail, profileData, driveData, organizationId } = input;

  const uploaderEmail =
    (authEmail ?? (profileData?.email as string) ?? "").trim().toLowerCase() || null;

  if (organizationId) {
    const seatSnap = await db.collection("organization_seats").doc(`${organizationId}_${uid}`).get();
    return {
      uploaderEmail,
      containerType: "organization",
      containerId: organizationId,
      personalTeamOwnerId: null,
      roleAtUpload: (seatSnap.data()?.role as string) ?? null,
    };
  }

  const driveTeamOwnerRaw = driveData?.personal_team_owner_id;
  const driveTeamOwner =
    typeof driveTeamOwnerRaw === "string" && driveTeamOwnerRaw.trim() ? driveTeamOwnerRaw.trim() : null;

  if (driveTeamOwner) {
    return resolvePersonalTeamFromOwner(db, uid, driveTeamOwner, uploaderEmail);
  }

  const driveUid =
    (driveData?.userId as string | undefined) ?? (driveData?.user_id as string | undefined);

  if (driveUid === uid) {
    return {
      uploaderEmail,
      containerType: "personal",
      containerId: uid,
      personalTeamOwnerId: null,
      roleAtUpload: null,
    };
  }

  if (driveUid && driveUid !== uid) {
    const memberSeatSnap = await db
      .collection(PERSONAL_TEAM_SEATS_COLLECTION)
      .doc(personalTeamSeatDocId(driveUid, uid))
      .get();
    const memberSt = memberSeatSnap.data()?.status as string | undefined;
    if (memberSeatSnap.exists && seatStatusAllowsEnter(memberSt)) {
      console.warn(
        "[resolveBackupUploadMetadata] recovery: team scope from drive owner uid + enterable seat (linked_drive had no personal_team_owner_id)",
        { driveOwnerUid: driveUid, uploaderUid: uid }
      );
      return resolvePersonalTeamFromOwner(db, uid, driveUid, uploaderEmail);
    }
  }

  return {
    uploaderEmail,
    containerType: "personal",
    containerId: uid,
    personalTeamOwnerId: null,
    roleAtUpload: null,
  };
}
