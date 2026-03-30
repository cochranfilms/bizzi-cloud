/**
 * Resolve linked_drive_id + backup_files scope fields for "Create Favorite Folder"
 * (template gallery_storage row first, then scoped drive lookup + org workspace resolution).
 */
import type { Firestore, Query } from "firebase-admin/firestore";
import type { GalleryManagementDoc } from "@/lib/gallery-owner-access";
import { canLinkBackupFileToGallery } from "@/lib/gallery-asset-link-access";
import {
  galleryMediaScopeFromGalleryDoc,
  linkedDriveMatchesGalleryMediaScope,
  type GalleryMediaScope,
} from "@/lib/gallery-media-drive-match";
import { resolveWorkspaceForOrgMemberDrive } from "@/lib/org-member-drive-workspace";
import { isBackupFileActiveForListing } from "@/lib/backup-file-lifecycle";
import { PROOFING_ROOT_FAVORITES } from "@/lib/gallery-proofing-types";
import { relativePathIsInPhotoProofingTree } from "@/lib/gallery-media-path";

/** @deprecated Use PROOFING_ROOT_FAVORITES / canonical photo segment */
export const GALLERY_FAVORITES_FOLDER_SEGMENT = PROOFING_ROOT_FAVORITES;

const TEMPLATE_FIELD_KEYS = [
  "organization_id",
  "workspace_id",
  "visibility_scope",
  "owner_user_id",
  "personal_team_owner_id",
  "container_type",
  "container_id",
  "role_at_upload",
  "team_id",
  "project_id",
  "uploader_email",
] as const;

export type GalleryFavoritesWriteContext = {
  linkedDriveId: string;
  /** Spread onto new backup_files (includes userId). */
  scopeFields: Record<string, unknown>;
};

export type GalleryFavoritesWriteContextError = {
  error: string;
  status: number;
};

/** Restrict dedupe to one proofing list folder (prefix without trailing slash). */
export function pathIsUnderProofingListPrefix(
  listFolderPrefix: string,
  relativePath: string
): boolean {
  const p = listFolderPrefix.replace(/\/$/, "");
  return relativePath === p || relativePath.startsWith(`${p}/`);
}

/**
 * Object keys already materialized under a specific list folder prefix (`materialized_relative_prefix`).
 */
export async function loadExistingProofingObjectKeys(
  db: Firestore,
  galleryId: string,
  linkedDriveId: string,
  organizationId: string | null,
  listFolderPrefix: string
): Promise<Set<string>> {
  let query: Query = db
    .collection("backup_files")
    .where("linked_drive_id", "==", linkedDriveId)
    .where("gallery_id", "==", galleryId);

  query =
    organizationId != null && organizationId !== ""
      ? query.where("organization_id", "==", organizationId)
      : query.where("organization_id", "==", null);

  const snap = await query.limit(2500).get();
  const keys = new Set<string>();
  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    if (!isBackupFileActiveForListing(d)) continue;
    const path = String(d.relative_path ?? "");
    if (!pathIsUnderProofingListPrefix(listFolderPrefix, path)) continue;
    const ok = d.object_key as string | undefined;
    if (ok) keys.add(ok);
  }
  return keys;
}

function scopeFieldsFromTemplate(template: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of TEMPLATE_FIELD_KEYS) {
    if (template[k] !== undefined) out[k] = template[k];
  }
  return out;
}

type OrgWorkspaceChainResult =
  | { ok: true; workspace_id: string; visibility_scope: string }
  | ({ ok: false } & GalleryFavoritesWriteContextError);

async function resolveOrgWorkspaceChain(
  actingUid: string,
  organizationId: string,
  memberDriveId: string,
  templateWorkspaceId: string | undefined,
  clientWorkspaceId: string | null | undefined
): Promise<OrgWorkspaceChainResult> {
  const attempts: (string | null)[] = [];
  const tw = templateWorkspaceId?.trim();
  if (tw) attempts.push(tw);
  const cw =
    clientWorkspaceId != null && String(clientWorkspaceId).trim() !== ""
      ? String(clientWorkspaceId).trim()
      : null;
  if (cw && !attempts.includes(cw)) attempts.push(cw);
  attempts.push(null);

  let lastErr: GalleryFavoritesWriteContextError | null = null;
  for (const ws of attempts) {
    const r = await resolveWorkspaceForOrgMemberDrive(actingUid, organizationId, memberDriveId, ws);
    if (r.ok)
      return { ok: true, workspace_id: r.workspace_id, visibility_scope: r.visibility_scope };
    lastErr = { error: r.error, status: r.status };
  }
  const fallback = lastErr ?? {
    error: "Could not resolve workspace for organization drive",
    status: 500,
  };
  return { ok: false, ...fallback };
}

async function findGalleryMediaDriveDoc(
  db: Firestore,
  scope: GalleryMediaScope
): Promise<{ id: string; data: Record<string, unknown> } | null> {
  const ownerUid = scope.kind === "personal_team" ? scope.teamOwnerUid : scope.ownerUid;
  const snap = await db.collection("linked_drives").where("userId", "==", ownerUid).get();
  const hits = snap.docs
    .filter((d) => linkedDriveMatchesGalleryMediaScope(d.data() as Record<string, unknown>, scope))
    .sort((a, b) => {
      const ca = (a.data().createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
      const cb = (b.data().createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
      return cb - ca;
    });
  const d = hits[0];
  return d ? { id: d.id, data: d.data() as Record<string, unknown> } : null;
}

async function createGalleryMediaDrive(db: Firestore, scope: GalleryMediaScope, now: Date) {
  const ownerUid = scope.kind === "personal_team" ? scope.teamOwnerUid : scope.ownerUid;
  const ref = await db.collection("linked_drives").add({
    userId: ownerUid,
    name: "Gallery Media",
    permission_handle_id: `gallery-media-${Date.now()}`,
    createdAt: now,
    is_org_shared: false,
    ...(scope.kind === "organization"
      ? { organization_id: scope.organizationId }
      : { organization_id: null }),
    ...(scope.kind === "personal_team"
      ? { personal_team_owner_id: scope.teamOwnerUid }
      : { personal_team_owner_id: null }),
  });
  return { id: ref.id };
}

async function loadTemplateBackupFile(
  db: Firestore,
  galleryId: string,
  galleryRow: GalleryManagementDoc,
  actingUid: string
): Promise<Record<string, unknown> | null> {
  const assetsSnap = await db
    .collection("gallery_assets")
    .where("gallery_id", "==", galleryId)
    .where("asset_origin", "==", "gallery_storage")
    .limit(25)
    .get();

  for (const adoc of assetsSnap.docs) {
    const backupFileId = adoc.data().backup_file_id as string | undefined;
    if (!backupFileId) continue;
    const fileSnap = await db.collection("backup_files").doc(backupFileId).get();
    if (!fileSnap.exists) continue;
    const fileData = fileSnap.data() as Record<string, unknown>;
    if (!isBackupFileActiveForListing(fileData)) continue;
    if (fileData.deleted_at) continue;
    const can = await canLinkBackupFileToGallery(actingUid, fileData, galleryRow);
    if (!can) continue;
    const gOnFile = fileData.gallery_id as string | undefined;
    if (gOnFile && gOnFile !== galleryId) continue;
    return fileData;
  }
  return null;
}

export async function resolveGalleryFavoritesWriteContext(
  db: Firestore,
  actingUid: string,
  galleryId: string,
  galleryRow: GalleryManagementDoc,
  options?: { preferredWorkspaceId?: string | null }
): Promise<GalleryFavoritesWriteContext | GalleryFavoritesWriteContextError> {
  const scope = galleryMediaScopeFromGalleryDoc(galleryRow as Record<string, unknown>);
  if (!scope) {
    return { error: "Gallery has no photographer", status: 400 };
  }

  const template = await loadTemplateBackupFile(db, galleryId, galleryRow, actingUid);
  const preferredWs = options?.preferredWorkspaceId ?? null;

  if (template && typeof template.linked_drive_id === "string") {
    const driveSnap = await db.collection("linked_drives").doc(template.linked_drive_id).get();
    const driveData = driveSnap.exists ? (driveSnap.data() as Record<string, unknown>) : undefined;
    const scopeOk =
      driveData &&
      linkedDriveMatchesGalleryMediaScope(driveData, scope) &&
      (await canLinkBackupFileToGallery(actingUid, template, galleryRow));

    if (scopeOk) {
      const fields = scopeFieldsFromTemplate(template);
      const uidOnFile =
        typeof template.userId === "string"
          ? template.userId
          : typeof template.user_id === "string"
            ? template.user_id
            : actingUid;
      fields.userId = uidOnFile;

      if (scope.kind === "organization") {
        const tplWs = typeof fields.workspace_id === "string" ? fields.workspace_id : undefined;
        const orgResolved = await resolveOrgWorkspaceChain(
          actingUid,
          scope.organizationId,
          template.linked_drive_id,
          tplWs,
          preferredWs
        );
        if (!orgResolved.ok) {
          return { error: orgResolved.error, status: orgResolved.status };
        }
        fields.workspace_id = orgResolved.workspace_id;
        fields.visibility_scope = orgResolved.visibility_scope;
        fields.owner_user_id = actingUid;
        fields.organization_id = scope.organizationId;
      } else {
        /** Explicit null matches gallery uploads + composite indexes (linked_drive_id + gallery_id + organization_id); omitting the field breaks queries. */
        fields.organization_id = null;
      }

      return {
        linkedDriveId: template.linked_drive_id,
        scopeFields: fields,
      };
    }
  }

  let drive = await findGalleryMediaDriveDoc(db, scope);
  const now = new Date();
  if (!drive) {
    const created = await createGalleryMediaDrive(db, scope, now);
    drive = { id: created.id, data: {} };
  }

  const linkedDriveId = drive.id;

  const fields: Record<string, unknown> = {
    userId: actingUid,
  };

  if (scope.kind === "organization") {
    fields.organization_id = scope.organizationId;
    const orgResolved = await resolveOrgWorkspaceChain(
      actingUid,
      scope.organizationId,
      linkedDriveId,
      undefined,
      preferredWs
    );
    if (!orgResolved.ok) {
      return { error: orgResolved.error, status: orgResolved.status };
    }
    fields.workspace_id = orgResolved.workspace_id;
    fields.visibility_scope = orgResolved.visibility_scope;
    fields.owner_user_id = actingUid;
  } else {
    fields.organization_id = null;
    if (scope.kind === "personal_team") {
      fields.personal_team_owner_id = scope.teamOwnerUid;
    }
  }

  return { linkedDriveId, scopeFields: fields };
}

/**
 * Dedupe query must use the same organization_id shape as writes: explicit `null` for
 * personal / personal-team (not “missing field”), matching upload rows and indexes.
 */
export async function loadExistingFavoriteObjectKeys(
  db: Firestore,
  galleryId: string,
  linkedDriveId: string,
  organizationId: string | null,
  galleryForRoots: { id: string; media_folder_segment?: string | null }
): Promise<Set<string>> {
  let query: Query = db
    .collection("backup_files")
    .where("linked_drive_id", "==", linkedDriveId)
    .where("gallery_id", "==", galleryId);

  query =
    organizationId != null && organizationId !== ""
      ? query.where("organization_id", "==", organizationId)
      : query.where("organization_id", "==", null);

  const snap = await query.limit(500).get();
  const keys = new Set<string>();
  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    if (!isBackupFileActiveForListing(d)) continue;
    const path = String(d.relative_path ?? "");
    if (!relativePathIsInPhotoProofingTree(path, galleryForRoots)) continue;
    const ok = d.object_key as string | undefined;
    if (ok) keys.add(ok);
  }
  return keys;
}
