/**
 * POST /api/mount/upload-complete
 * Creates backup_files record after a file is uploaded via WebDAV PUT.
 * Used when user adds a file to the mounted drive.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { checkUserCanUpload } from "@/lib/enterprise-storage";
import { queueProxyJob } from "@/lib/proxy-queue";
import { NextResponse } from "next/server";

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;

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
  } = body;

  let uid: string;
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
  const organizationId = driveData?.organization_id ?? null;

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
    deleted_at: null,
    organization_id: organizationId,
  });

  // Trigger metadata extraction, proxy, and MUX (await so they complete before serverless terminates)
  const base = new URL(request.url).origin;
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
    queueProxyJob({
      object_key: objectKey,
      name: safePath,
      backup_file_id: fileRef.id,
      user_id: uid,
    }).catch((e) => console.error("[upload-complete] queueProxyJob:", e));
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
