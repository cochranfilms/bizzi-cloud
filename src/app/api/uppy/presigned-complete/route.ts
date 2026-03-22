/**
 * Uppy S3 API — Create backup_files record after presigned PUT upload (files ≤5MB).
 * For small files, Uppy uses presigned PUT directly to B2; no multipart complete is called.
 * The client calls this after a successful presigned upload so the file appears in Storage/Recent Uploads.
 */
import { isB2Configured } from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { isVideoFile } from "@/lib/bizzi-file-types";
import { getOrCreateMyPrivateWorkspaceId } from "@/lib/ensure-default-workspaces";
import { userCanAccessWorkspace } from "@/lib/workspace-access";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  let body: {
    driveId: string;
    relativePath: string;
    sizeBytes: number;
    contentType?: string;
    lastModified?: number | null;
    /** Org ID for enterprise context */
    workspaceId?: string | null;
    /** Workspace doc ID for org uploads (required when workspaceId/org present); resolves to My Private if omitted */
    workspace_id?: string | null;
    galleryId?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    driveId,
    relativePath,
    sizeBytes,
    contentType = "application/octet-stream",
    lastModified,
    workspaceId = null,
    workspace_id: workspaceIdFromBody = null,
    galleryId = null,
  } = body;

  if (!driveId || !relativePath || typeof sizeBytes !== "number" || sizeBytes <= 0) {
    return NextResponse.json(
      { error: "driveId, relativePath, and sizeBytes are required" },
      { status: 400 }
    );
  }

  let uid: string;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!token) {
    return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
  }
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  // Skip checkUserCanUpload — file is already in B2; rejecting would orphan it
  const safePath = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");
  const objectKey = `backups/${uid}/${driveId}/${safePath}`;
  const modifiedAt =
    lastModified != null && !Number.isNaN(lastModified)
      ? new Date(lastModified).toISOString()
      : new Date().toISOString();

  const db = getAdminFirestore();
  const organizationId = workspaceId ?? null;

  // Org context: resolve workspace_id, validate write access
  let workspaceIdResolved: string | null = null;
  let visibilityScope: "personal" | "private_org" | "org_shared" | "team" | "project" | "gallery" = "personal";
  if (organizationId) {
    workspaceIdResolved = workspaceIdFromBody ?? (await getOrCreateMyPrivateWorkspaceId(uid, organizationId, driveId));
    if (!workspaceIdResolved) {
      return NextResponse.json(
        { error: "Could not resolve workspace for org upload" },
        { status: 400 }
      );
    }
    const canWrite = await userCanAccessWorkspace(uid, workspaceIdResolved);
    if (!canWrite) {
      return NextResponse.json({ error: "No write access to workspace" }, { status: 403 });
    }
    visibilityScope = "private_org";
  }

  const snapshotRef = await db.collection("backup_snapshots").add({
    linked_drive_id: driveId,
    userId: uid,
    status: "completed",
    files_count: 1,
    bytes_synced: sizeBytes,
    completed_at: new Date(),
  });

  const fileRef = await db.collection("backup_files").add({
    backup_snapshot_id: snapshotRef.id,
    linked_drive_id: driveId,
    userId: uid,
    relative_path: safePath,
    object_key: objectKey,
    size_bytes: sizeBytes,
    content_type: contentType,
    modified_at: modifiedAt,
    deleted_at: null,
    organization_id: organizationId,
    gallery_id: galleryId ?? null,
    workspace_id: workspaceIdResolved,
    visibility_scope: visibilityScope,
    owner_user_id: uid,
  });

  await db.doc(`linked_drives/${driveId}`).update({
    last_synced_at: new Date().toISOString(),
  });

  const baseUrl = new URL(request.url).origin;
  fetch(`${baseUrl}/api/files/extract-metadata`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      backup_file_id: fileRef.id,
      object_key: objectKey,
    }),
  }).catch(() => {});

  if (isVideoFile(safePath)) {
    const { createMuxAssetFromBackup } = await import("@/lib/mux");
    createMuxAssetFromBackup(objectKey, safePath, fileRef.id).catch((err) => {
      console.error("[presigned-complete] Mux create failed:", err);
    });
  }

  if (galleryId) {
    try {
      const assetsRes = await fetch(`${baseUrl}/api/galleries/${galleryId}/assets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ backup_file_ids: [fileRef.id] }),
      });
      if (!assetsRes.ok) {
        console.error("[presigned-complete] Failed to add to gallery:", await assetsRes.text());
      }
    } catch (err) {
      console.error("[presigned-complete] Gallery assets add failed:", err);
    }
  }

  return NextResponse.json({ ok: true, objectKey });
}
