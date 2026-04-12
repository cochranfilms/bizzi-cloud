/**
 * Materialize a proofing list: shortcut backup_files under immutable materialized_relative_prefix.
 * Retries are idempotent (per-prefix object_key dedupe). See plan for partial / failed semantics.
 */
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import type { GalleryManagementDoc } from "@/lib/gallery-owner-access";
import { macosPackageFirestoreFieldsFromRelativePath } from "@/lib/backup-file-macos-package-metadata";
import { linkBackupFileToMacosPackageContainer } from "@/lib/macos-package-container-admin";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import {
  loadExistingProofingObjectKeys,
  resolveGalleryFavoritesWriteContext,
} from "@/lib/gallery-favorites-write-context";
import type { MaterializationState, ProofingListType } from "@/lib/gallery-proofing-types";
import { proofingRootSegmentFromListType } from "@/lib/gallery-proofing-types";
import {
  ensureProofingShortcutParentFolder,
  repairProofingMaterializedShortcutsMissingFolderId,
} from "@/lib/gallery-proofing-storage-layout";
import { resolveMediaFolderSegmentForPath } from "@/lib/gallery-media-path";
import { assignProofingFolderSlug } from "@/lib/gallery-proofing-slug";
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

export type MaterializeProofingListOk = {
  ok: true;
  drive_id: string;
  materialized_relative_prefix: string;
  files_saved: number;
  files_skipped_dedupe: number;
  target_asset_count: number;
  skipped_asset_count: number;
  materialization_state: MaterializationState;
  materialized_asset_count: number;
};

export type MaterializeProofingListErr = { ok: false; error: string; status: number };

async function ensureImmutableListPrefix(
  db: Firestore,
  galleryId: string,
  listId: string,
  galleryRow: GalleryManagementDoc
): Promise<{ prefix: string }> {
  const ref = db.collection("favorites_lists").doc(listId);
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) throw new Error("LIST_NOT_FOUND");
    const d = snap.data()!;
    if (d.gallery_id !== galleryId) throw new Error("LIST_MISMATCH");

    const existing = d.materialized_relative_prefix as string | undefined;
    if (existing && typeof existing === "string" && existing.length > 0) {
      return { prefix: existing };
    }

    const listType: ProofingListType =
      d.list_type === "video_selects" ? "video_selects" : "photo_favorites";
    const root = proofingRootSegmentFromListType(listType);
    const media = resolveMediaFolderSegmentForPath(
      { ...galleryRow, id: galleryId } as Record<string, unknown>,
      galleryId
    );
    const clientFolder =
      (typeof d.client_folder_segment === "string" && d.client_folder_segment.trim()) ||
      (typeof d.folder_slug === "string" && d.folder_slug.trim()) ||
      assignProofingFolderSlug({
        title: d.title as string | undefined,
        listDocId: listId,
        clientName: d.client_name as string | undefined,
      });
    const materialized_relative_prefix = `${media}/${root}/${clientFolder}`;

    const patch: Record<string, unknown> = {
      proofing_root_segment: root,
      materialized_relative_prefix,
      materialization_state: (d.materialization_state as string) ?? "idle",
      status: (d.status as string) ?? "submitted",
      materialization_version: typeof d.materialization_version === "number" ? d.materialization_version : 1,
      submitted_asset_count:
        typeof d.submitted_asset_count === "number"
          ? d.submitted_asset_count
          : Array.isArray(d.asset_ids)
            ? d.asset_ids.length
            : 0,
      updated_at: new Date(),
    };
    if (!(typeof d.client_folder_segment === "string" && d.client_folder_segment.trim())) {
      patch.client_folder_segment = clientFolder;
    }

    t.update(ref, patch);
    return { prefix: materialized_relative_prefix };
  });
}

async function enterProcessingOrThrow(db: Firestore, listRef: DocumentReference) {
  await db.runTransaction(async (t) => {
    const snap = await t.get(listRef);
    const d = snap.data()!;
    if ((d.status as string) === "archived") throw new Error("ARCHIVED");
    if (d.materialization_state === "processing") throw new Error("CONFLICT");
    t.update(listRef, {
      materialization_state: "processing",
      last_materialization_attempt_at: new Date(),
      last_materialization_error: null,
      updated_at: new Date(),
    });
  });
}

export async function materializeProofingList(params: {
  db: Firestore;
  actingUid: string;
  galleryId: string;
  listId: string;
  galleryRow: GalleryManagementDoc;
  preferredWorkspaceId?: string | null;
}): Promise<MaterializeProofingListOk | MaterializeProofingListErr> {
  const { db, actingUid, galleryId, listId, galleryRow, preferredWorkspaceId } = params;
  const listRef = db.collection("favorites_lists").doc(listId);
  const listSnap = await listRef.get();
  if (!listSnap.exists) return { ok: false, error: "List not found", status: 404 };
  const listData = listSnap.data()!;
  if (listData.gallery_id !== galleryId) {
    return { ok: false, error: "List not found", status: 404 };
  }
  if ((listData.status as string) === "archived") {
    return { ok: false, error: "List is archived", status: 400 };
  }

  const listMediaKind: "photo" | "video" =
    listData.list_type === "video_selects" ? "video" : "photo";
  let prefix: string;
  try {
    const r = await ensureImmutableListPrefix(db, galleryId, listId, galleryRow);
    prefix = r.prefix;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "LIST_NOT_FOUND") return { ok: false, error: "List not found", status: 404 };
    if (msg === "LIST_MISMATCH") return { ok: false, error: "List not found", status: 404 };
    return { ok: false, error: msg, status: 500 };
  }

  const writeCtx = await resolveGalleryFavoritesWriteContext(db, actingUid, galleryId, galleryRow, {
    preferredWorkspaceId: preferredWorkspaceId ?? null,
  });
  if (!("linkedDriveId" in writeCtx)) {
    return { ok: false, error: writeCtx.error, status: writeCtx.status };
  }
  const { linkedDriveId, scopeFields } = writeCtx;

  try {
    await enterProcessingOrThrow(db, listRef);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "ARCHIVED") return { ok: false, error: "List is archived", status: 400 };
    if (msg === "CONFLICT") {
      return { ok: false, error: "Materialization already in progress", status: 409 };
    }
    return { ok: false, error: msg, status: 500 };
  }

  const explicitOrganizationId = normOrgId(scopeFields.organization_id ?? galleryRow.organization_id);

  const assetIds: string[] = Array.isArray(listData.asset_ids) ? listData.asset_ids : [];
  const eligible: EligibleAsset[] = [];
  const skippedIds: string[] = [];

  for (const aid of assetIds) {
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
    if (listMediaKind === "photo" && mt !== "image") {
      skippedIds.push(aid);
      continue;
    }
    if (listMediaKind === "video" && mt !== "video") {
      skippedIds.push(aid);
      continue;
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

  let existingKeys: Set<string>;
  try {
    existingKeys = await loadExistingProofingObjectKeys(
      db,
      galleryId,
      linkedDriveId,
      explicitOrganizationId,
      prefix
    );
  } catch (err) {
    await listRef.update({
      materialization_state: "failed",
      last_materialization_error: String(err).slice(0, 500),
      target_asset_count: eligible.length,
      skipped_asset_count: skippedIds.length,
      skipped_asset_ids_sample: skippedIds.slice(0, 25),
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

  const toCreate: EligibleAsset[] = [];
  for (const a of eligible) {
    if (!existingKeys.has(a.object_key)) toCreate.push(a);
  }
  const files_skipped_dedupe = eligible.length - toCreate.length;

  const nowIso = new Date().toISOString();
  let wroteThisRun = 0;

  try {
    let layout: { leafFolderId: string } | null = null;

    if (eligible.length > 0) {
      try {
        layout = await ensureProofingShortcutParentFolder(db, actingUid, linkedDriveId, prefix);
      } catch (layoutErr) {
        const lm = layoutErr instanceof Error ? layoutErr.message : String(layoutErr);
        await listRef.update({
          materialization_state: "failed",
          target_asset_count: eligible.length,
          skipped_asset_count: skippedIds.length,
          skipped_asset_ids_sample: skippedIds.slice(0, 25),
          last_materialization_error: `folder_layout:${lm}`.slice(0, 500),
          updated_at: new Date(),
        });
        return {
          ok: false,
          error:
            lm === "GALLERY_MEDIA_DRIVE_V2_REQUIRED"
              ? "Gallery Media drive could not be prepared for folders"
              : `Materialization folder layout failed: ${lm}`,
          status: 500,
        };
      }
      await repairProofingMaterializedShortcutsMissingFolderId(db, {
        linkedDriveId,
        galleryId,
        organizationId: explicitOrganizationId,
        prefix,
        leafFolderId: layout.leafFolderId,
      });
    }

    if (toCreate.length > 0) {
      if (!layout) {
        await listRef.update({
          materialization_state: "failed",
          target_asset_count: eligible.length,
          skipped_asset_count: skippedIds.length,
          skipped_asset_ids_sample: skippedIds.slice(0, 25),
          last_materialization_error: "folder_layout:internal_missing_layout",
          updated_at: new Date(),
        });
        return { ok: false, error: "Materialization folder layout failed", status: 500 };
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
          const relativePath = `${prefix}/${safeName}`;
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
              console.error("[materializeProofingList] macos package link:", fid, err);
            })
          )
        );
      }

      await db.collection("linked_drives").doc(linkedDriveId).update({
        last_synced_at: nowIso,
      });
    } else if (eligible.length > 0) {
      await db.collection("linked_drives").doc(linkedDriveId).update({
        last_synced_at: nowIso,
      });
    }

    const finalKeys = await loadExistingProofingObjectKeys(
      db,
      galleryId,
      linkedDriveId,
      explicitOrganizationId,
      prefix
    );
    const covered = eligible.filter((e) => finalKeys.has(e.object_key));
    const materialized_asset_count = covered.length;
    const allEligibleDone = eligible.length === 0 || eligible.every((e) => finalKeys.has(e.object_key));
    const terminal: MaterializationState = allEligibleDone ? "complete" : "partial";

    const wsId = (scopeFields.workspace_id as string | undefined) ?? null;
    const vis = (scopeFields.visibility_scope as string | undefined) ?? null;

    await listRef.update({
      materialization_state: terminal,
      target_asset_count: eligible.length,
      skipped_asset_count: skippedIds.length,
      skipped_asset_ids_sample: skippedIds.slice(0, 25),
      materialized_asset_count,
      materialized_linked_drive_id: linkedDriveId,
      workspace_id: wsId,
      visibility_scope: vis,
      materialized_at: allEligibleDone ? new Date() : listData.materialized_at ?? null,
      materialized_by_uid: allEligibleDone ? actingUid : listData.materialized_by_uid ?? null,
      last_materialization_error: null,
      updated_at: new Date(),
    });

    return {
      ok: true,
      drive_id: linkedDriveId,
      materialized_relative_prefix: prefix,
      files_saved: wroteThisRun,
      files_skipped_dedupe,
      target_asset_count: eligible.length,
      skipped_asset_count: skippedIds.length,
      materialization_state: terminal,
      materialized_asset_count,
    };
  } catch (err) {
    const msg = String(err).slice(0, 500);
    const finalKeysCatch = await loadExistingProofingObjectKeys(
      db,
      galleryId,
      linkedDriveId,
      explicitOrganizationId,
      prefix
    ).catch(() => new Set<string>());
    const materialized_asset_count = eligible.filter((e) => finalKeysCatch.has(e.object_key)).length;
    const terminal: MaterializationState = wroteThisRun > 0 ? "partial" : "failed";
    await listRef.update({
      materialization_state: terminal,
      target_asset_count: eligible.length,
      skipped_asset_count: skippedIds.length,
      skipped_asset_ids_sample: skippedIds.slice(0, 25),
      materialized_asset_count,
      materialized_linked_drive_id:
        materialized_asset_count > 0 ? linkedDriveId : listData.materialized_linked_drive_id ?? null,
      last_materialization_error: msg,
      workspace_id: scopeFields.workspace_id ?? listData.workspace_id ?? null,
      visibility_scope: scopeFields.visibility_scope ?? listData.visibility_scope ?? null,
      updated_at: new Date(),
    });
    if (terminal === "failed") {
      return { ok: false, error: msg || "Materialization failed", status: 500 };
    }
    return {
      ok: true,
      drive_id: linkedDriveId,
      materialized_relative_prefix: prefix,
      files_saved: wroteThisRun,
      files_skipped_dedupe,
      target_asset_count: eligible.length,
      skipped_asset_count: skippedIds.length,
      materialization_state: terminal,
      materialized_asset_count,
    };
  }
}
