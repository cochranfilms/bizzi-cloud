/**
 * Resolves denormalized container / uploader fields when creating backup_files server-side.
 */
import type { Firestore } from "firebase-admin/firestore";
import { personalTeamSeatDocId } from "@/lib/personal-team";

export type BackupFileContainerType = "personal" | "organization" | "personal_team";

export type ResolvedBackupUploadMetadata = {
  uploaderEmail: string | null;
  containerType: BackupFileContainerType | null;
  containerId: string | null;
  personalTeamOwnerId: string | null;
  roleAtUpload: string | null;
};

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
  const personalTeamOwnerFromProfile = profileData?.personal_team_owner_id as string | undefined;

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

  if (personalTeamOwnerFromProfile) {
    const teamOwner = personalTeamOwnerFromProfile;
    const seatSnap = await db
      .collection("personal_team_seats")
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

  const driveUid =
    (driveData?.userId as string | undefined) ?? (driveData?.user_id as string | undefined);

  if (driveUid === uid) {
    const ownsTeam = await db
      .collection("personal_team_seats")
      .where("team_owner_user_id", "==", uid)
      .limit(1)
      .get();
    if (!ownsTeam.empty) {
      return {
        uploaderEmail,
        containerType: "personal_team",
        containerId: uid,
        personalTeamOwnerId: uid,
        roleAtUpload: "admin",
      };
    }
    return {
      uploaderEmail,
      containerType: "personal",
      containerId: uid,
      personalTeamOwnerId: null,
      roleAtUpload: null,
    };
  }

  return {
    uploaderEmail,
    containerType: "personal",
    containerId: uid,
    personalTeamOwnerId: null,
    roleAtUpload: null,
  };
}
