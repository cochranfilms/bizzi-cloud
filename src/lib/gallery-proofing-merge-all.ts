/**
 * Merge all active proofing lists for a gallery into a new _merged/{merge_slug} folder (one snapshot per call).
 */
import type { Firestore } from "firebase-admin/firestore";
import type { GalleryManagementDoc } from "@/lib/gallery-owner-access";
import { macosPackageFirestoreFieldsFromRelativePath } from "@/lib/backup-file-macos-package-metadata";
import { linkBackupFileToMacosPackageContainer } from "@/lib/macos-package-container-admin";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import {
  loadExistingProofingObjectKeys,
  resolveGalleryFavoritesWriteContext,
} from "@/lib/gallery-favorites-write-context";
import {
  ensureProofingShortcutParentFolder,
  repairProofingMaterializedShortcutsMissingFolderId,
} from "@/lib/gallery-proofing-storage-layout";
import { PROOFING_MERGED_SEGMENT } from "@/lib/gallery-proofing-types";
import {
  buildMergeRelativePrefix,
  canonicalProofingRootSegment,
  resolveMediaFolderSegmentForPath,
} from "@/lib/gallery-media-path";
import { assignMergeSlug } from "@/lib/gallery-proofing-slug";
import type { MaterializationState, ShellContext } from "@/lib/gallery-proofing-types";
import { toNormalizedComparisonKey } from "@/lib/storage-folders/normalize";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|tiff?|heic)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi)$/i;

function normOrgId(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  return s || null;
}

function getContentType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mime: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    tiff: "image/tiff",
    tif: "image/tiff",
    heic: "image/heic",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    avi: "video/x-msvideo",
  };
  return mime[ext] ?? "application/octet-stream";
}

type EligibleAsset = {
  assetId: string;
  object_key: string;
  name: string;
  size_bytes: number;
  media_type: "image" | "video";
};

export type MergeAllOk = {
  ok: true;
  merge_run_id: string;
  merge_slug: string;
  drive_id: string;
  merge_relative_prefix: string;
  files_saved: number;
  target_asset_count: number;
  skipped_asset_count: number;
  materialization_state: MaterializationState;
};

export type MergeAllErr = { ok: false; error: string; status: number };

function galleryKind(g: Record<string, unknown>): "photo" | "video" | "mixed" {
  if (g.gallery_type === "video") return "video";
  if (g.gallery_type === "mixed") return "mixed";
  return "photo";
}

export async function mergeAllProofingLists(params: {
  db: Firestore;
  actingUid: string;
  galleryId: string;
  galleryRow: GalleryManagementDoc;
  preferredWorkspaceId?: string | null;
  shellContext: ShellContext;
}): Promise<MergeAllOk | MergeAllErr> {
  const { db, actingUid, galleryId, galleryRow, preferredWorkspaceId, shellContext } = params;
  const gKind = galleryKind(galleryRow as Record<string, unknown>);

  const writeCtx = await resolveGalleryFavoritesWriteContext(db, actingUid, galleryId, galleryRow, {
    preferredWorkspaceId: preferredWorkspaceId ?? null,
  });
  if (!("linkedDriveId" in writeCtx)) {
    return { ok: false, error: writeCtx.error, status: writeCtx.status };
  }
  const { linkedDriveId, scopeFields } = writeCtx;
  const explicitOrganizationId = normOrgId(scopeFields.organization_id ?? galleryRow.organization_id);

  const listsSnap = await db
    .collection("favorites_lists")
    .where("gallery_id", "==", galleryId)
    .get();

  const assetIdSet = new Set<string>();
  for (const doc of listsSnap.docs) {
    const d = doc.data();
    if ((d.status as string) === "archived") continue;
    const lt = d.list_type as string | undefined;
    if (gKind === "photo" && lt === "video_selects") continue;
    if (gKind === "video" && lt === "photo_favorites") continue;
    for (const id of (d.asset_ids as string[]) ?? []) assetIdSet.add(id);
  }

  const merge_slug = assignMergeSlug();
  const mediaFolder = resolveMediaFolderSegmentForPath(
    { ...galleryRow, id: galleryId } as Record<string, unknown>,
    galleryId
  );
  const mergePathKind: "photo" | "video" = gKind === "mixed" ? "photo" : gKind;
  const merge_relative_prefix = buildMergeRelativePrefix({
    mediaFolderSegment: mediaFolder,
    galleryKind: mergePathKind,
    mergeSlug: merge_slug,
    mergedSegment: PROOFING_MERGED_SEGMENT,
  });

  const mergeRef = db
    .collection("galleries")
    .doc(galleryId)
    .collection("proofing_merge_runs")
    .doc();

  const now = new Date();
  await mergeRef.set({
    merge_slug,
    proofing_root_segment: canonicalProofingRootSegment(mergePathKind),
    merge_relative_prefix,
    merged_at: null,
    merged_by_uid: actingUid,
    shell_context: shellContext,
    workspace_id: null,
    visibility_scope: null,
    linked_drive_id: null,
    policy: "all_submitted_lists",
    materialization_state: "processing",
    source_list_count: listsSnap.size,
    created_at: now,
    updated_at: now,
  });

  const skippedIds: string[] = [];
  const eligible: EligibleAsset[] = [];
  for (const aid of assetIdSet) {
    const asnap = await db.collection("gallery_assets").doc(aid).get();
    if (!asnap.exists) {
      skippedIds.push(aid);
      continue;
    }
    const ad = asnap.data()!;
    if (ad.gallery_id !== galleryId) {
      skippedIds.push(aid);
      continue;
    }
    const mt = ad.media_type as string | undefined;
    if (gKind !== "mixed") {
      if (gKind === "photo" && mt !== "image") {
        skippedIds.push(aid);
        continue;
      }
      if (gKind === "video" && mt !== "video") {
        skippedIds.push(aid);
        continue;
      }
    }
    const name = (ad.name as string) ?? "download";
    const ok = ad.object_key as string | undefined;
    if (!ok) {
      skippedIds.push(aid);
      continue;
    }
    if (!(IMAGE_EXT.test(name) || VIDEO_EXT.test(name))) {
      skippedIds.push(aid);
      continue;
    }
    eligible.push({
      assetId: aid,
      object_key: ok,
      name,
      size_bytes: (ad.size_bytes as number) ?? 0,
      media_type: mt === "video" ? "video" : "image",
    });
  }

  /** Dedupe same object_key across lists */
  const byKey = new Map<string, EligibleAsset>();
  for (const e of eligible) byKey.set(e.object_key, e);
  const uniqueEligible = [...byKey.values()];

  let existingKeys: Set<string>;
  try {
    existingKeys = await loadExistingProofingObjectKeys(
      db,
      galleryId,
      linkedDriveId,
      explicitOrganizationId,
      merge_relative_prefix
    );
  } catch {
    await mergeRef.update({
      materialization_state: "failed",
      last_error: "Failed to load existing keys",
      updated_at: new Date(),
    });
    return { ok: false, error: "Failed to load existing keys", status: 500 };
  }

  const usedNames = new Map<string, number>();
  const uniqueNameFor = (name: string) => {
    let finalName = name;
    const base = name.replace(/\.([^.]+)$/, "");
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
    let n = 0;
    while (usedNames.has(finalName)) {
      n++;
      finalName = `${base} (${n})${ext}`;
    }
    usedNames.set(finalName, 1);
    return finalName;
  };

  const toCreate = uniqueEligible.filter((a) => !existingKeys.has(a.object_key));
  const nowIso = new Date().toISOString();
  let wroteThisRun = 0;

  try {
    let layout: { leafFolderId: string } | null = null;

    if (uniqueEligible.length > 0) {
      try {
        layout = await ensureProofingShortcutParentFolder(
          db,
          actingUid,
          linkedDriveId,
          merge_relative_prefix
        );
      } catch (layoutErr) {
        const lm = layoutErr instanceof Error ? layoutErr.message : String(layoutErr);
        await mergeRef.update({
          materialization_state: "failed",
          last_error: `folder_layout:${lm}`.slice(0, 500),
          updated_at: new Date(),
        });
        return {
          ok: false,
          error:
            lm === "GALLERY_MEDIA_DRIVE_V2_REQUIRED"
              ? "Gallery Media drive could not be prepared for folders"
              : `Merge folder layout failed: ${lm}`,
          status: 500,
        };
      }
      await repairProofingMaterializedShortcutsMissingFolderId(db, {
        linkedDriveId,
        galleryId,
        organizationId: explicitOrganizationId,
        prefix: merge_relative_prefix,
        leafFolderId: layout.leafFolderId,
      });
    }

    if (toCreate.length > 0) {
      if (!layout) {
        await mergeRef.update({
          materialization_state: "failed",
          last_error: "folder_layout:internal_missing_layout",
          updated_at: new Date(),
        });
        return { ok: false, error: "Merge folder layout failed", status: 500 };
      }

      const snapshotRef = await db.collection("backup_snapshots").add({
        linked_drive_id: linkedDriveId,
        userId: actingUid,
        status: "completed",
        files_count: toCreate.length,
        bytes_synced: 0,
        completed_at: nowIso,
      });

      const BATCH = 400;
      for (let i = 0; i < toCreate.length; i += BATCH) {
        const chunk = toCreate.slice(i, i + BATCH);
        const batch = db.batch();
        const newFileIds: string[] = [];
        for (const asset of chunk) {
          const safeName = uniqueNameFor(asset.name);
          const relativePath = `${merge_relative_prefix}/${safeName}`;
          const fileRef = db.collection("backup_files").doc();
          newFileIds.push(fileRef.id);
          const row: Record<string, unknown> = {
            backup_snapshot_id: snapshotRef.id,
            linked_drive_id: linkedDriveId,
            folder_id: layout.leafFolderId,
            file_name: safeName,
            file_name_compare_key: toNormalizedComparisonKey(safeName) || null,
            relative_path: relativePath,
            object_key: asset.object_key,
            size_bytes: asset.size_bytes ?? 0,
            content_type: getContentType(safeName),
            modified_at: nowIso,
            uploaded_at: nowIso,
            deleted_at: null,
            lifecycle_state: BACKUP_LIFECYCLE_ACTIVE,
            gallery_id: galleryId,
            ...scopeFields,
            ...macosPackageFirestoreFieldsFromRelativePath(relativePath),
            organization_id: explicitOrganizationId,
            media_type: asset.media_type,
          };
          batch.set(fileRef, row);
        }
        await batch.commit();
        wroteThisRun += chunk.length;
        await Promise.all(
          newFileIds.map((fid) =>
            linkBackupFileToMacosPackageContainer(db, fid).catch((err) => {
              console.error("[mergeAllProofingLists] macos package link:", fid, err);
            })
          )
        );
      }

      await db.collection("linked_drives").doc(linkedDriveId).update({
        last_synced_at: nowIso,
      });
    } else if (uniqueEligible.length > 0) {
      await db.collection("linked_drives").doc(linkedDriveId).update({
        last_synced_at: nowIso,
      });
    }

    const finalKeys = await loadExistingProofingObjectKeys(
      db,
      galleryId,
      linkedDriveId,
      explicitOrganizationId,
      merge_relative_prefix
    );
    const materialized_asset_count = uniqueEligible.filter((e) => finalKeys.has(e.object_key)).length;
    const allDone =
      uniqueEligible.length === 0 || uniqueEligible.every((e) => finalKeys.has(e.object_key));
    const terminal: MaterializationState = allDone ? "complete" : "partial";

    const wsId = (scopeFields.workspace_id as string | undefined) ?? null;
    const vis = (scopeFields.visibility_scope as string | undefined) ?? null;

    await mergeRef.update({
      materialization_state: terminal,
      merged_at: new Date(),
      linked_drive_id: linkedDriveId,
      workspace_id: wsId,
      visibility_scope: vis,
      target_asset_count: uniqueEligible.length,
      skipped_asset_count: skippedIds.length,
      materialized_asset_count,
      updated_at: new Date(),
    });

    return {
      ok: true,
      merge_run_id: mergeRef.id,
      merge_slug,
      drive_id: linkedDriveId,
      merge_relative_prefix,
      files_saved: wroteThisRun,
      target_asset_count: uniqueEligible.length,
      skipped_asset_count: skippedIds.length,
      materialization_state: terminal,
    };
  } catch (err) {
    const msg = String(err).slice(0, 500);
    const terminal: MaterializationState = wroteThisRun > 0 ? "partial" : "failed";
    await mergeRef.update({
      materialization_state: terminal,
      last_error: msg,
      linked_drive_id: linkedDriveId,
      workspace_id: scopeFields.workspace_id ?? null,
      visibility_scope: scopeFields.visibility_scope ?? null,
      updated_at: new Date(),
    });
    if (terminal === "failed") {
      return { ok: false, error: msg, status: 500 };
    }
    return {
      ok: true,
      merge_run_id: mergeRef.id,
      merge_slug,
      drive_id: linkedDriveId,
      merge_relative_prefix,
      files_saved: wroteThisRun,
      target_asset_count: uniqueEligible.length,
      skipped_asset_count: skippedIds.length,
      materialization_state: terminal,
    };
  }
}
