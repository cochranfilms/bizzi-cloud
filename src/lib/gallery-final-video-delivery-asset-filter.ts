/**
 * Final Delivery video galleries must not surface files under the gallery's archival RAW subfolder
 * (`{segment}/RAW/...`). Those rows remain in Firestore for storage integrity; list/read APIs filter them.
 */
import type { Firestore } from "firebase-admin/firestore";
import { normalizeGalleryMediaMode } from "@/lib/gallery-media-mode";
import { relativePathIsInGalleryRawArchiveSubfolder } from "@/lib/gallery-media-path";

export type GalleryRowForFinalVideoFilter = {
  id: string;
  gallery_type?: unknown;
  media_mode?: unknown;
  source_format?: unknown;
  media_folder_segment?: unknown;
};

export function shouldOmitAssetFromFinalVideoDeliveryListing(
  gallery: GalleryRowForFinalVideoFilter,
  backupRelativePath: string | null | undefined
): boolean {
  if (gallery.gallery_type !== "video") return false;
  const mode = normalizeGalleryMediaMode({
    media_mode: gallery.media_mode as string | null | undefined,
    source_format: gallery.source_format as string | null | undefined,
  });
  if (mode !== "final") return false;
  const rel = (backupRelativePath ?? "").replace(/^\/+/, "");
  if (!rel) return false;
  return relativePathIsInGalleryRawArchiveSubfolder(rel, {
    id: gallery.id,
    media_folder_segment:
      typeof gallery.media_folder_segment === "string" ? gallery.media_folder_segment : null,
  });
}

export async function fetchBackupRelativePathsById(
  db: Firestore,
  backupFileIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(backupFileIds.filter((x) => typeof x === "string" && x))];
  await Promise.all(
    unique.map(async (fid) => {
      const snap = await db.collection("backup_files").doc(fid).get();
      if (snap.exists) {
        map.set(fid, String(snap.data()?.relative_path ?? "").replace(/^\/+/, ""));
      }
    })
  );
  return map;
}

export async function isGalleryAssetOmittedFromFinalVideoDelivery(
  db: Firestore,
  gallery: GalleryRowForFinalVideoFilter,
  backupFileId: string | null | undefined
): Promise<boolean> {
  if (!backupFileId) return false;
  const snap = await db.collection("backup_files").doc(backupFileId).get();
  const rel = snap.exists ? String(snap.data()?.relative_path ?? "") : "";
  return shouldOmitAssetFromFinalVideoDeliveryListing(gallery, rel);
}
