import { isB2Configured } from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import {
  runBackupPresignedCompleteCore,
  type PresignedCompleteBody,
} from "@/lib/backup-presigned-complete-runner";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function POST(request: Request) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = body.session_id ?? body.sessionId;
  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!isDevAuthBypass() && !token) {
    return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
  }

  let uid: string;
  let authEmail: string | undefined;
  if (isDevAuthBypass() && typeof body.user_id === "string") {
    uid = body.user_id;
  } else if (token) {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
      authEmail = decoded.email;
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
  } else {
    return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const sessionSnap = await db.collection("upload_sessions").doc(sessionId).get();
  if (!sessionSnap.exists) {
    return NextResponse.json({ error: "Upload session not found" }, { status: 404 });
  }

  const sess = sessionSnap.data()!;
  if (sess.userId !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const objectKey = sess.objectKey as string;
  const uploadMode = (sess.upload_mode as string) ?? "multipart";
  const sessionStatus = sess.status as string;

  if (uploadMode === "multipart" && sessionStatus !== "completed") {
    return NextResponse.json(
      { error: "Multipart upload must be completed before finalize" },
      { status: 400 }
    );
  }

  if (uploadMode === "single_put" && sessionStatus === "aborted") {
    return NextResponse.json({ error: "Upload session was aborted" }, { status: 410 });
  }

  const driveId = (body.drive_id ?? body.driveId ?? sess.driveId) as string;
  const relativePath = (body.relative_path ?? body.relativePath ?? sess.relative_path) as
    | string
    | undefined;
  const sizeBytesRaw = body.size_bytes ?? body.sizeBytes ?? sess.fileSize;
  const contentType =
    (body.content_type ?? body.contentType ?? sess.contentType) as string | undefined;

  if (!driveId || !relativePath || typeof sizeBytesRaw !== "number" || !Number.isFinite(sizeBytesRaw)) {
    return NextResponse.json(
      {
        error:
          "drive_id and relative_path are required (or stored on session); size_bytes must be known",
      },
      { status: 400 }
    );
  }

  const merged = {
    driveId,
    relativePath,
    sizeBytes: sizeBytesRaw,
    contentType: contentType ?? "application/octet-stream",
    lastModified: (body.last_modified ?? body.lastModified ?? sess.lastModified) as number | null | undefined,
    workspace_id: (body.workspace_id ?? body.workspaceId ?? sess.workspaceId) as string | null | undefined,
    workspaceId: (body.workspace_id ?? body.workspaceId ?? sess.workspaceId) as string | null | undefined,
    galleryId: (body.gallery_id ?? body.galleryId) as string | null | undefined,
    reservation_id: null as string | null,
    reservationId: null as string | null,
    uploadIntent: (body.upload_intent ?? body.uploadIntent ?? null) as string | null,
    lockedDestination: (body.locked_destination ?? body.lockedDestination ?? null) as
      | boolean
      | string
      | null,
    destinationMode: (body.destination_mode ?? body.destinationMode ?? null) as string | null,
    routeContext: (body.route_context ?? body.routeContext ?? null) as string | null,
    sourceSurface: (body.source_surface ?? body.sourceSurface ?? null) as string | null,
    targetDriveName: (body.target_drive_name ?? body.targetDriveName ?? null) as string | null,
    resolvedBy: (body.resolved_by ?? body.resolvedBy ?? null) as string | null,
    folder_id: (body.folder_id ?? body.folderId) as string | null | undefined,
    folderId: (body.folder_id ?? body.folderId) as string | null | undefined,
  } satisfies PresignedCompleteBody;

  if (uploadMode === "single_put") {
    const rid = sess.storage_quota_reservation_id;
    if (typeof rid === "string" && rid.length > 0) {
      merged.reservation_id = rid;
      merged.reservationId = rid;
    }
  }

  const appOrigin = new URL(request.url).origin;

  const res = await runBackupPresignedCompleteCore({
    body: merged,
    uid,
    authEmail,
    token: token ?? "",
    appOrigin,
    objectKeyOverride: objectKey,
    proxyEnqueueSource:
      uploadMode === "multipart" ? "ingest_multipart_complete" : "ingest_presigned_complete",
  });

  if (res.status >= 200 && res.status < 300) {
    await sessionSnap.ref.update({
      status: "finalized",
      finalizedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return res;
}
