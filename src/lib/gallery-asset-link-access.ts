/**
 * Whether a backup_files row may be linked into a gallery via "From files"
 * (not necessarily owned by the acting user — team/org workspace sharing).
 */
import type { DocumentData } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { GalleryManagementDoc } from "@/lib/gallery-owner-access";
import { getAccessibleWorkspaceIds, userHasActiveOrganizationSeat } from "@/lib/workspace-access";

export async function canLinkBackupFileToGallery(
  uid: string,
  fileData: DocumentData,
  galleryRow: GalleryManagementDoc
): Promise<boolean> {
  if (fileData.deleted_at) return false;
  if (fileData.userId === uid) return true;

  const galleryOrgRaw = galleryRow.organization_id;
  const galleryOrg =
    galleryOrgRaw != null && String(galleryOrgRaw).trim() !== "" ? String(galleryOrgRaw).trim() : null;

  if (galleryOrg) {
    const fileOrg = fileData.organization_id;
    if (fileOrg !== galleryOrg) return false;
    const db = getAdminFirestore();
    const profileSnap = await db.collection("profiles").doc(uid).get();
    const profileOrgId = profileSnap.data()?.organization_id as string | undefined;
    const hasSeat = await userHasActiveOrganizationSeat(uid, galleryOrg);
    if (profileOrgId !== galleryOrg && !hasSeat) return false;

    const wsId = fileData.workspace_id as string | undefined;
    if (wsId) {
      const accessible = await getAccessibleWorkspaceIds(uid, galleryOrg);
      return accessible.includes(wsId);
    }
    return true;
  }

  const galleryPtoRaw = galleryRow.personal_team_owner_id;
  const galleryPto =
    typeof galleryPtoRaw === "string" && galleryPtoRaw.trim() !== "" ? galleryPtoRaw.trim() : null;

  if (galleryPto) {
    const filePto = fileData.personal_team_owner_id as string | undefined;
    if (filePto === galleryPto) return true;
    const driveId = fileData.linked_drive_id as string | undefined;
    if (!driveId) return false;
    const driveSnap = await getAdminFirestore().collection("linked_drives").doc(driveId).get();
    const d = driveSnap.data();
    if (!d || d.deleted_at) return false;
    return d.personal_team_owner_id === galleryPto;
  }

  // Solo personal gallery: only the file owner can link.
  return false;
}
