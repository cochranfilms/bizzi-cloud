import type { Firestore } from "firebase-admin/firestore";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import { isImageThumbnailTarget } from "@/lib/gallery-file-types";
import { shouldUseVideoThumbnailPipeline } from "@/lib/raw-video";

const PDF_EXT = /\.pdf$/i;
/** Scan oldest files until we find one we can thumbnail (image / video / PDF). */
const COVER_SCAN_LIMIT = 40;

export type StorageFolderCoverFile = {
  object_key: string;
  file_name: string;
  content_type: string | null;
};

function isCoverEligible(
  fileName: string,
  objectKey: string,
  contentType: string | null
): boolean {
  if (PDF_EXT.test(fileName) || contentType === "application/pdf") return true;
  if (shouldUseVideoThumbnailPipeline(fileName) || Boolean(contentType?.startsWith("video/")))
    return true;
  return isImageThumbnailTarget(fileName, objectKey, contentType);
}

/**
 * Earliest-uploaded file in a v2 folder that supports dashboard thumbnails (image, proxy video, PDF first page).
 */
export async function getStorageFolderCoverFile(
  db: Firestore,
  linkedDriveId: string,
  folderId: string
): Promise<StorageFolderCoverFile | null> {
  const snap = await db
    .collection("backup_files")
    .where("linked_drive_id", "==", linkedDriveId)
    .where("folder_id", "==", folderId)
    .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
    .orderBy("created_at", "asc")
    .limit(COVER_SCAN_LIMIT)
    .select("object_key", "file_name", "content_type")
    .get();

  for (const doc of snap.docs) {
    const d = doc.data();
    const object_key = String(d.object_key ?? "").trim();
    if (!object_key) continue;
    const file_name =
      String(d.file_name ?? "").trim() ||
      object_key.split("/").filter(Boolean).pop() ||
      "";
    const content_type = typeof d.content_type === "string" ? d.content_type : null;
    if (isCoverEligible(file_name, object_key, content_type)) {
      return { object_key, file_name, content_type };
    }
  }
  return null;
}
