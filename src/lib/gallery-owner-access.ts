import { getAdminFirestore } from "@/lib/firebase-admin";

export type GalleryManagementDoc = {
  photographer_id?: string;
  organization_id?: string | null;
  personal_team_owner_id?: string | null;
};

/** In-app notify this user for team galleries (owner); otherwise the gallery creator. */
export function galleryNotificationRecipientUserId(data: GalleryManagementDoc): string {
  const ptoRaw = data.personal_team_owner_id;
  const pto = typeof ptoRaw === "string" && ptoRaw.trim() ? ptoRaw.trim() : null;
  if (pto) return pto;
  return typeof data.photographer_id === "string" ? data.photographer_id : "";
}

/**
 * Whether uid may perform photographer-level actions on this gallery (settings,
 * assets, etc.). Org galleries: creator only. Personal / team: creator, team
 * owner, or active personal-team seat on the team container.
 */
export async function userCanManageGalleryAsPhotographer(
  uid: string,
  data: GalleryManagementDoc
): Promise<boolean> {
  if (data.photographer_id === uid) return true;
  const orgId = data.organization_id;
  if (orgId != null && String(orgId).trim() !== "") return false;

  const ptoRaw = data.personal_team_owner_id;
  const pto = typeof ptoRaw === "string" && ptoRaw.trim() ? ptoRaw.trim() : null;
  if (!pto) return false;
  if (uid === pto) return true;

  const db = getAdminFirestore();
  const seatSnap = await db.collection("personal_team_seats").doc(`${pto}_${uid}`).get();
  const st = seatSnap.data()?.status as string | undefined;
  return seatSnap.exists && (st === "active" || st === "cold_storage");
}
