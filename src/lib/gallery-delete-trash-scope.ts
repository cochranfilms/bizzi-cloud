/**
 * Same-scope safety for soft-deleting backup_files when deleting a gallery (option 2).
 * Membership is gallery_assets.backup_file_id; this only rejects cross-boundary / invalid rows.
 * Do not use canLinkBackupFileToGallery — it encodes “newly linkable now,” which can be stricter than delete scope.
 */
import type { DocumentData } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { GalleryManagementDoc } from "@/lib/gallery-owner-access";
import { resolveEnterpriseAccess } from "@/lib/enterprise-access";
import { getAccessibleWorkspaceIds } from "@/lib/workspace-access";

export async function backupFileInGalleryTrashScope(
  actorUid: string,
  fileData: DocumentData,
  galleryRow: GalleryManagementDoc
): Promise<boolean> {
  const galleryOrgRaw = galleryRow.organization_id;
  const galleryOrg =
    galleryOrgRaw != null && String(galleryOrgRaw).trim() !== ""
      ? String(galleryOrgRaw).trim()
      : null;

  const galleryPtoRaw = galleryRow.personal_team_owner_id;
  const galleryPto =
    typeof galleryPtoRaw === "string" && galleryPtoRaw.trim() !== ""
      ? galleryPtoRaw.trim()
      : null;

  if (galleryOrg) {
    const fileOrg = fileData.organization_id;
    if (fileOrg !== galleryOrg) return false;
    const db = getAdminFirestore();
    const access = await resolveEnterpriseAccess(actorUid, galleryOrg, db);
    if (!access.canAccessEnterprise) return false;

    const wsId = fileData.workspace_id as string | undefined;
    if (wsId) {
      const accessible = await getAccessibleWorkspaceIds(actorUid, galleryOrg);
      return accessible.includes(wsId);
    }
    return true;
  }

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

  const photographerId =
    typeof galleryRow.photographer_id === "string" && galleryRow.photographer_id
      ? galleryRow.photographer_id
      : "";
  if (!photographerId) return false;
  return fileData.userId === photographerId;
}
