/**
 * POST /api/mount/upload-complete
 * Creates backup_files record after a file is uploaded via WebDAV PUT.
 * Used when user adds a file to the mounted drive.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { checkUserCanUpload } from "@/lib/enterprise-storage";
import { getOrCreateMyPrivateWorkspaceId } from "@/lib/ensure-default-workspaces";
import { visibilityScopeFromWorkspaceType } from "@/lib/workspace-visibility";
import { userCanWriteWorkspace } from "@/lib/workspace-access";
import { logActivityEvent } from "@/lib/activity-log";
import {
  PERSONAL_TEAM_SEATS_COLLECTION,
  personalTeamSeatDocId,
} from "@/lib/personal-team";
import { resolveBackupUploadMetadata } from "@/lib/backup-file-upload-metadata";
import { queueProxyJob } from "@/lib/proxy-queue";
import { NextResponse } from "next/server";

/** Includes RAW (braw, r3d, ari, crm, etc.) so queueProxyJob can mark raw_unsupported */
const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf|mts|mkv|3gp|m2ts|mpg|mpeg|ts|flv|wmv|ogv|braw|r3d|ari|dng|crm|rcd|sir)$/i;

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const {
    drive_id: driveId,
    relative_path: relativePath,
    object_key: objectKey,
    size_bytes: sizeBytes,
    content_type: contentType,
    user_id: userIdFromBody,
    workspace_id: workspaceIdFromBody,
  } = body;

  let uid: string;
  let authEmail: string | undefined;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (isDevAuthBypass() && userIdFromBody) {
    uid = userIdFromBody;
  } else if (!token) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization" },
      { status: 401 }
    );
  } else {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
      authEmail = decoded.email;
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }
  }

  if (
    !driveId ||
    typeof relativePath !== "string" ||
    !relativePath ||
    !objectKey ||
    typeof objectKey !== "string"
  ) {
    return NextResponse.json(
      { error: "drive_id, relative_path, and object_key are required" },
      { status: 400 }
    );
  }

  const size = typeof sizeBytes === "number" && sizeBytes >= 0 ? sizeBytes : 0;
  try {
    await checkUserCanUpload(uid, size, typeof driveId === "string" ? driveId : undefined);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Storage limit reached";
    return NextResponse.json({ error: msg }, { status: 403 });
  }

  const db = getAdminFirestore();

  // Resolve slug (Storage, RAW, Gallery Media) to primary drive ID
  let driveIdStr = typeof driveId === "string" ? driveId : null;
  if (driveIdStr && ["Storage", "RAW", "Gallery Media"].includes(driveIdStr)) {
    const [byUserId, byUserIdSnake] = await Promise.all([
      db.collection("linked_drives").where("userId", "==", uid).get(),
      db.collection("linked_drives").where("user_id", "==", uid).get(),
    ]);
    const seen = new Set<string>();
    const slugToIds = new Map<string, string[]>();
    const addToSlug = (slug: string, id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      const arr = slugToIds.get(slug) ?? [];
      if (!arr.includes(id)) arr.push(id);
      slugToIds.set(slug, arr);
    };
    for (const snap of [byUserId, byUserIdSnake]) {
      for (const d of snap.docs) {
        if (d.data().deleted_at) continue;
        const name = d.data().name ?? "Drive";
        const isCreatorRaw = d.data().is_creator_raw === true;
        if (name === "Storage" || name === "Uploads") addToSlug("Storage", d.id);
        else if (isCreatorRaw) addToSlug("RAW", d.id);
        else if (name === "Gallery Media") addToSlug("Gallery Media", d.id);
      }
    }
    const ids = slugToIds.get(driveIdStr) ?? [];
    driveIdStr = ids[0] ?? driveIdStr;
  }

  const driveSnap = await db.collection("linked_drives").doc(driveIdStr!).get();
  if (!driveSnap.exists) {
    return NextResponse.json({ error: "Drive not found" }, { status: 404 });
  }
  const driveData = driveSnap.data();
  const driveOrgId = driveData?.organization_id ?? null;

  let organizationId: string | null = null;
  let workspaceIdResolved: string | null = null;
  let visibilityScope: "personal" | "private_org" | "org_shared" | "team" | "project" | "gallery" = "personal";

  if (workspaceIdFromBody) {
    const wsSnap = await db.collection("workspaces").doc(workspaceIdFromBody).get();
    if (!wsSnap.exists) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    const wsData = wsSnap.data();
    organizationId = (wsData?.organization_id as string) ?? null;
    if (!organizationId) {
      return NextResponse.json({ error: "Invalid workspace" }, { status: 400 });
    }
    const canWrite = await userCanWriteWorkspace(uid, workspaceIdFromBody);
    if (!canWrite) {
      return NextResponse.json({ error: "No write access to workspace" }, { status: 403 });
    }
    workspaceIdResolved = workspaceIdFromBody;
    visibilityScope = visibilityScopeFromWorkspaceType((wsData?.workspace_type as string) ?? "private");
  } else if (driveOrgId) {
    workspaceIdResolved = await getOrCreateMyPrivateWorkspaceId(uid, driveOrgId, driveIdStr!);
    if (!workspaceIdResolved) {
      return NextResponse.json({ error: "Could not resolve workspace for org upload" }, { status: 400 });
    }
    const canWrite = await userCanWriteWorkspace(uid, workspaceIdResolved);
    if (!canWrite) {
      return NextResponse.json({ error: "No write access to workspace" }, { status: 403 });
    }
    organizationId = driveOrgId;
    visibilityScope = "private_org";
  }

  let personalTeamOwnerId: string | null = null;
  const driveOwnerUid =
    typeof driveData?.userId === "string"
      ? driveData.userId
      : typeof driveData?.user_id === "string"
        ? driveData.user_id
        : null;
  if (
    !workspaceIdFromBody &&
    !driveOrgId &&
    driveOwnerUid &&
    driveOwnerUid !== uid
  ) {
    const seatSnap = await db
      .collection(PERSONAL_TEAM_SEATS_COLLECTION)
      .doc(personalTeamSeatDocId(driveOwnerUid, uid))
      .get();
    const st = seatSnap.data()?.status as string | undefined;
    if (!seatSnap.exists || st !== "active") {
      return NextResponse.json(
        { error: "You do not have access to this drive." },
        { status: 403 }
      );
    }
    personalTeamOwnerId = driveOwnerUid;
  }

  const profileSnap = await db.collection("profiles").doc(uid).get();
  const uploadMeta = await resolveBackupUploadMetadata(db, {
    uid,
    authEmail,
    profileData: profileSnap.data(),
    driveData,
    organizationId,
  });
  const teamOwnerForFile = personalTeamOwnerId ?? uploadMeta.personalTeamOwnerId;

  const safePath = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");

  // Create minimal snapshot (required by backup_files schema)
  const now = new Date().toISOString();
  const snapshotRef = await db.collection("backup_snapshots").add({
    linked_drive_id: driveIdStr,
    status: "completed",
    files_count: 1,
    bytes_synced: size,
    error_message: null,
    started_at: now,
    completed_at: now,
  });

  const fileRef = await db.collection("backup_files").add({
    backup_snapshot_id: snapshotRef.id,
    linked_drive_id: driveIdStr,
    userId: uid,
    relative_path: safePath,
    object_key: objectKey,
    size_bytes: size,
    content_type: typeof contentType === "string" ? contentType : "application/octet-stream",
    modified_at: now,
    uploaded_at: now,
    deleted_at: null,
    organization_id: organizationId,
    workspace_id: workspaceIdResolved,
    visibility_scope: visibilityScope,
    owner_user_id: uid,
    uploader_email: uploadMeta.uploaderEmail,
    container_type: uploadMeta.containerType,
    container_id: uploadMeta.containerId,
    personal_team_owner_id: teamOwnerForFile,
    role_at_upload: uploadMeta.roleAtUpload,
  });

  // Trigger metadata extraction, proxy, and MUX (await so they complete before serverless terminates)
  const base = new URL(request.url).origin;
  logActivityEvent({
    event_type: "file_uploaded",
    actor_user_id: uid,
    scope_type: organizationId ? "organization" : "personal_account",
    organization_id: organizationId,
    workspace_id: workspaceIdResolved,
    visibility_scope: visibilityScope,
    linked_drive_id: driveIdStr,
    file_id: fileRef.id,
    target_type: "file",
    target_name: safePath.split("/").pop() ?? safePath,
    file_path: safePath,
    metadata: {
      file_size: size,
      upload_source: "mount",
    },
  }).catch(() => {});

  const fetchHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (token) fetchHeaders.Authorization = `Bearer ${token}`;
  const extractUrl = new URL("/api/files/extract-metadata", request.url);
  await fetch(extractUrl.toString(), {
    method: "POST",
    headers: fetchHeaders,
    body: JSON.stringify({ backup_file_id: fileRef.id, object_key: objectKey }),
  }).catch((e) => console.error("[upload-complete] extract-metadata:", e));

  // MUX asset and proxy for video files (proxy via queue to avoid serverless timeout)
  if (VIDEO_EXT.test(safePath) && token) {
    await queueProxyJob({
      object_key: objectKey,
      name: safePath,
      backup_file_id: fileRef.id,
      user_id: uid,
    }).catch((e) => console.error("[upload-complete] queueProxyJob:", e));
    // Trigger immediate proxy processing (fire-and-forget; cron fallback if this fails)
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      fetch(`${base}/api/proxy/process-one`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cronSecret}` },
        body: JSON.stringify({ object_key: objectKey }),
      }).catch(() => {});
    }
    fetch(`${base}/api/mux/create-asset`, {
        method: "POST",
        headers: fetchHeaders,
        body: JSON.stringify({
          object_key: objectKey,
          name: safePath,
          backup_file_id: fileRef.id,
        }),
      }).catch((e) => console.error("[upload-complete] mux/create-asset:", e));
  }

  return NextResponse.json({
    ok: true,
    backup_file_id: fileRef.id,
    object_key: objectKey,
  });
}
