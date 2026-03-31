/**
 * When a video gallery switches from RAW to Final Delivery, archive in-gallery source videos
 * into `{media_folder_segment}/RAW/...` under Gallery Media. Does not touch Creator RAW drive policy.
 */
import type { DocumentData, DocumentReference, Firestore } from "firebase-admin/firestore";
import { creativeFirestoreFieldsFromRelativePath } from "@/lib/creative-file-registry";
import { macosPackageFirestoreFieldsFromRelativePath } from "@/lib/backup-file-macos-package-metadata";
import {
  copyObjectServerSide,
  deleteObject,
  getObjectMetadata,
  isB2Configured,
} from "@/lib/b2";
import { isBackupFileActiveForListing } from "@/lib/backup-file-lifecycle";
import { GALLERY_VIDEO_EXT } from "@/lib/gallery-file-types";
import type { GalleryAssetOrigin, UpdateGalleryInput } from "@/types/gallery";
import {
  isValidMediaMode,
  legacySourceFormatFromMediaMode,
  normalizeGalleryMediaMode,
} from "@/lib/gallery-media-mode";
import {
  galleryStoragePathRoots,
  relativePathBelongsToGalleryRoots,
  relativePathIsInGalleryRawArchiveSubfolder,
  relativePathIsInVideoProofingTree,
  resolveGalleryRawVideoArchiveDestinationRelativePath,
  resolveMediaFolderSegmentForPath,
} from "@/lib/gallery-media-path";
import { reconcileMacosPackageMembershipForBackupFile } from "@/lib/macos-package-container-admin";
import { bumpGalleryAssetsVersion } from "@/lib/gallery-asset-mutations";

const LOG_EVENT = "gallery_raw_video_archive_on_final_conversion";

export type GalleryRawVideoArchiveSkip = {
  backup_file_id: string;
  asset_id?: string;
  reason: string;
};

export type GalleryRawVideoArchiveError = {
  backup_file_id: string;
  message: string;
};

export type GalleryRawVideoArchiveResult = {
  moved_count: number;
  skipped: GalleryRawVideoArchiveSkip[];
  errors: GalleryRawVideoArchiveError[];
  destination_relative_prefix: string | null;
};

function buildObjectKey(uid: string, driveId: string, relativePath: string): string {
  const safePath = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");
  return `backups/${uid}/${driveId}/${safePath}`;
}

function fileBasenameFromRelativePath(relativePath: string): string {
  const trimmed = relativePath.replace(/^\/+/, "");
  return trimmed.split("/").filter(Boolean).pop() ?? trimmed;
}

async function driveIsGalleryMedia(db: Firestore, driveId: string): Promise<boolean> {
  const d = await db.collection("linked_drives").doc(driveId).get();
  return (d.data()?.name as string | undefined) === "Gallery Media";
}

function logStructured(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ ...payload, at: new Date().toISOString() }));
}

/**
 * Archives eligible gallery-stored video backup files into `…/RAW/…` after profile switch.
 * Idempotent: skips files already under the gallery RAW folder or already at the destination path.
 */
export async function archiveRawSourceVideosOnVideoGalleryFinalConversion(
  db: Firestore,
  params: {
    actorUid: string;
    galleryId: string;
    galleryRow: DocumentData;
    previous_profile: "raw" | "final";
    next_profile: "raw" | "final";
  }
): Promise<GalleryRawVideoArchiveResult> {
  const { actorUid, galleryId, galleryRow, previous_profile, next_profile } = params;
  const galleryTitle =
    typeof galleryRow.title === "string" ? galleryRow.title.trim() : "";
  const galleryForPaths = {
    id: galleryId,
    media_folder_segment:
      typeof galleryRow.media_folder_segment === "string" ? galleryRow.media_folder_segment : null,
  };
  const segment = resolveMediaFolderSegmentForPath(
    { title: galleryTitle, media_folder_segment: galleryRow.media_folder_segment },
    galleryId
  );
  const destination_relative_prefix = `${segment}/RAW`;

  const skipped: GalleryRawVideoArchiveSkip[] = [];
  const errors: GalleryRawVideoArchiveError[] = [];
  let moved_count = 0;

  const assetsSnap = await db.collection("gallery_assets").where("gallery_id", "==", galleryId).get();

  type Candidate = {
    assetId: string;
    backupFileId: string;
    origin: GalleryAssetOrigin | undefined;
    mediaType: string | undefined;
  };

  const candidates: Candidate[] = [];
  for (const doc of assetsSnap.docs) {
    const a = doc.data();
    candidates.push({
      assetId: doc.id,
      backupFileId: a.backup_file_id as string,
      origin: a.asset_origin as GalleryAssetOrigin | undefined,
      mediaType: a.media_type as string | undefined,
    });
  }

  const b2Ok = isB2Configured();
  const roots = galleryStoragePathRoots(galleryForPaths);

  type MoveWork = {
    assetId: string;
    backupFileId: string;
    fileRef: DocumentReference;
    destRel: string;
    driveId: string;
    oldKey: string;
    newKey: string;
  };

  const toMove: MoveWork[] = [];

  for (const c of candidates) {
    if (!c.backupFileId) {
      skipped.push({ backup_file_id: "", asset_id: c.assetId, reason: "missing_backup_file_id" });
      continue;
    }
    if (c.origin === "linked") {
      skipped.push({
        backup_file_id: c.backupFileId,
        asset_id: c.assetId,
        reason: "asset_origin_linked",
      });
      continue;
    }
    if (c.mediaType !== "video") {
      skipped.push({
        backup_file_id: c.backupFileId,
        asset_id: c.assetId,
        reason: "not_video_asset",
      });
      continue;
    }

    const fileSnap = await db.collection("backup_files").doc(c.backupFileId).get();
    if (!fileSnap.exists) {
      skipped.push({
        backup_file_id: c.backupFileId,
        asset_id: c.assetId,
        reason: "backup_file_missing",
      });
      continue;
    }
    const fileRow = fileSnap.data()!;
    if (!isBackupFileActiveForListing(fileRow)) {
      skipped.push({
        backup_file_id: c.backupFileId,
        asset_id: c.assetId,
        reason: "backup_file_not_active",
      });
      continue;
    }

    const rel = ((fileRow.relative_path ?? "") as string).replace(/^\/+/, "");
    const nameFromPath = fileBasenameFromRelativePath(rel);
    if (!GALLERY_VIDEO_EXT.test(nameFromPath)) {
      skipped.push({
        backup_file_id: c.backupFileId,
        asset_id: c.assetId,
        reason: "path_not_video_extension",
      });
      continue;
    }

    const driveId = fileRow.linked_drive_id as string | undefined;
    if (!driveId) {
      skipped.push({
        backup_file_id: c.backupFileId,
        asset_id: c.assetId,
        reason: "missing_linked_drive_id",
      });
      continue;
    }
    if (!(await driveIsGalleryMedia(db, driveId))) {
      skipped.push({
        backup_file_id: c.backupFileId,
        asset_id: c.assetId,
        reason: "not_gallery_media_drive",
      });
      continue;
    }

    if (!relativePathBelongsToGalleryRoots(rel, roots)) {
      skipped.push({
        backup_file_id: c.backupFileId,
        asset_id: c.assetId,
        reason: "path_outside_gallery_roots",
      });
      continue;
    }

    if (relativePathIsInVideoProofingTree(rel, galleryForPaths)) {
      skipped.push({
        backup_file_id: c.backupFileId,
        asset_id: c.assetId,
        reason: "in_video_proofing_tree",
      });
      continue;
    }

    if (relativePathIsInGalleryRawArchiveSubfolder(rel, galleryForPaths)) {
      skipped.push({
        backup_file_id: c.backupFileId,
        asset_id: c.assetId,
        reason: "already_in_gallery_raw_archive",
      });
      continue;
    }

    const storageUid =
      (fileRow.userId as string | undefined) ||
      (fileRow.owner_user_id as string | undefined) ||
      "";
    if (!storageUid) {
      skipped.push({
        backup_file_id: c.backupFileId,
        asset_id: c.assetId,
        reason: "missing_file_owner",
      });
      continue;
    }

    const destRel = resolveGalleryRawVideoArchiveDestinationRelativePath(rel, galleryForPaths);
    if (!destRel || destRel === rel) {
      skipped.push({
        backup_file_id: c.backupFileId,
        asset_id: c.assetId,
        reason: "no_archive_destination",
      });
      continue;
    }

    const fileRef = db.collection("backup_files").doc(c.backupFileId);
    const oldKey = ((fileRow.object_key ?? "") as string).trim();
    const newKey = buildObjectKey(storageUid, driveId, destRel);
    if (!oldKey || !newKey || oldKey === newKey) {
      skipped.push({
        backup_file_id: c.backupFileId,
        asset_id: c.assetId,
        reason: "invalid_or_same_object_key",
      });
      continue;
    }

    toMove.push({
      assetId: c.assetId,
      backupFileId: c.backupFileId,
      fileRef,
      destRel,
      driveId,
      oldKey,
      newKey,
    });
  }

  if (toMove.length > 0 && !b2Ok) {
    const msg = "B2 not configured; cannot archive RAW source videos";
    logStructured({
      event: LOG_EVENT,
      level: "error",
      gallery_id: galleryId,
      gallery_name: galleryTitle || galleryId,
      previous_profile,
      next_profile,
      moved_count: 0,
      destination_relative_path_prefix: destination_relative_prefix,
      error: msg,
      planned_moves: toMove.length,
    });
    errors.push({ backup_file_id: "_bulk", message: msg });
    return { moved_count: 0, skipped, errors, destination_relative_prefix: destination_relative_prefix };
  }

  for (const w of toMove) {
    try {
      const metaOld = await getObjectMetadata(w.oldKey);
      if (!metaOld) {
        errors.push({
          backup_file_id: w.backupFileId,
          message: "source_missing_in_b2",
        });
        continue;
      }
      const metaNewExisting = await getObjectMetadata(w.newKey);
      if (!metaNewExisting) {
        await copyObjectServerSide(w.oldKey, w.newKey);
      } else if (metaNewExisting.contentLength !== metaOld.contentLength) {
        errors.push({
          backup_file_id: w.backupFileId,
          message: "destination_exists_different_size",
        });
        continue;
      }

      const now = new Date();
      const creative = creativeFirestoreFieldsFromRelativePath(w.destRel);
      const macosPkg = macosPackageFirestoreFieldsFromRelativePath(w.destRel);
      const newBasename = fileBasenameFromRelativePath(w.destRel);

      await w.fileRef.update({
        relative_path: w.destRel,
        object_key: w.newKey,
        ...creative,
        ...macosPkg,
      });

      await db.collection("gallery_assets").doc(w.assetId).update({
        object_key: w.newKey,
        name: newBasename,
        updated_at: now,
      });

      try {
        await reconcileMacosPackageMembershipForBackupFile(db, w.backupFileId);
      } catch (e) {
        logStructured({
          event: LOG_EVENT,
          level: "warn",
          gallery_id: galleryId,
          backup_file_id: w.backupFileId,
          reconcile_error: e instanceof Error ? e.message : String(e),
        });
      }

      try {
        await deleteObject(w.oldKey);
      } catch (delErr) {
        logStructured({
          event: LOG_EVENT,
          level: "warn",
          gallery_id: galleryId,
          backup_file_id: w.backupFileId,
          delete_source_error: delErr instanceof Error ? delErr.message : String(delErr),
          note: "destination_copy_committed",
        });
      }

      moved_count++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ backup_file_id: w.backupFileId, message });
      logStructured({
        event: LOG_EVENT,
        level: "error",
        gallery_id: galleryId,
        gallery_name: galleryTitle || galleryId,
        backup_file_id: w.backupFileId,
        asset_id: w.assetId,
        error: message,
      });
    }
  }

  logStructured({
    event: LOG_EVENT,
    level: errors.length > 0 ? "warn" : "info",
    gallery_id: galleryId,
    gallery_name: galleryTitle || galleryId,
    actor_user_id: actorUid,
    previous_profile,
    next_profile,
    moved_count,
    destination_relative_path_prefix: destination_relative_prefix,
    skipped_count: skipped.length,
    skipped_sample: skipped.slice(0, 40),
    errors,
  });

  if (moved_count > 0) {
    await bumpGalleryAssetsVersion(db, galleryId);
  }

  return { moved_count, skipped, errors, destination_relative_prefix: destination_relative_prefix };
}

/**
 * True when this PATCH would move a video gallery from RAW to Final (archive required before committing profile).
 * Mirrors transaction merge rules for media_mode / source_format.
 */
export function patchRequestsVideoRawToFinalConversion(
  galleryData: DocumentData,
  body: UpdateGalleryInput
): boolean {
  if (galleryData.gallery_type !== "video") return false;
  const profileFieldsTouched =
    Object.prototype.hasOwnProperty.call(body, "media_mode") ||
    Object.prototype.hasOwnProperty.call(body, "source_format");
  if (!profileFieldsTouched) return false;
  if (body.media_mode !== undefined && !isValidMediaMode(body.media_mode)) {
    return false;
  }

  const prevProfileMode = normalizeGalleryMediaMode({
    media_mode: galleryData.media_mode as string | null | undefined,
    source_format: galleryData.source_format as string | null | undefined,
  });

  let mergedMedia: string | undefined =
    typeof galleryData.media_mode === "string" ? galleryData.media_mode : undefined;
  let mergedSf: string | undefined =
    typeof galleryData.source_format === "string" ? galleryData.source_format : undefined;

  if (body.media_mode !== undefined) {
    mergedMedia = body.media_mode;
    mergedSf = legacySourceFormatFromMediaMode(body.media_mode);
  } else if (body.source_format !== undefined) {
    const sf = body.source_format === "raw" ? "raw" : "jpg";
    mergedSf = sf;
    mergedMedia = sf === "raw" ? "raw" : "final";
  }

  const nextProfileMode = normalizeGalleryMediaMode({
    media_mode: mergedMedia,
    source_format: mergedSf,
  });

  return prevProfileMode === "raw" && nextProfileMode === "final";
}
