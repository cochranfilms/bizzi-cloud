/**
 * POST /api/backup/backfill-proxies
 * Enqueues proxy generation for existing videos (RAW + Storage) that don't have proxies.
 * Used to fix "proxies have no data" for files uploaded before queue or where generation failed.
 */
import { getProxyObjectKey, isB2Configured, objectExists } from "@/lib/b2";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/firebase-admin";
import { queueProxyJob } from "@/lib/proxy-queue";
import { NextResponse } from "next/server";

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;
const MAX_BATCH = 100;

function isVideoPath(relativePath: string): boolean {
  return VIDEO_EXT.test(relativePath.split("/").pop()?.toLowerCase() ?? "");
}

export async function POST(request: Request) {
  if (!isB2Configured()) {
    return NextResponse.json({ error: "B2 not configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  let body: { drive_slug?: string; limit?: number } = {};
  try {
    body = (await request.json().catch(() => ({}))) as typeof body;
  } catch {
    // empty body ok
  }

  const limit = Math.min(
    typeof body.limit === "number" ? body.limit : 50,
    MAX_BATCH
  );
  const driveSlug = body.drive_slug; // optional: "Storage" | "RAW" | "Gallery Media"

  const db = getAdminFirestore();

  // Resolve drive IDs for the user
  let driveIds: string[] = [];
  const [byUserId, byUserIdSnake] = await Promise.all([
    db.collection("linked_drives").where("userId", "==", uid).get(),
    db.collection("linked_drives").where("user_id", "==", uid).get(),
  ]);

  const slugToIds = new Map<string, string[]>();
  const addToSlug = (slug: string, id: string) => {
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

  if (driveSlug) {
    driveIds = slugToIds.get(driveSlug) ?? [];
  } else {
    driveIds = [
      ...(slugToIds.get("Storage") ?? []),
      ...(slugToIds.get("RAW") ?? []),
      ...(slugToIds.get("Gallery Media") ?? []),
    ];
  }

  if (driveIds.length === 0) {
    return NextResponse.json({ ok: true, enqueued: 0, message: "No drives to process" });
  }

  // Fetch video files from backup_files (all matching drives)
  const filesSnap = await db
    .collection("backup_files")
    .where("userId", "==", uid)
    .where("deleted_at", "==", null)
    .where("linked_drive_id", "in", driveIds.slice(0, 10)) // Firestore "in" max 10
    .get();

  // If more than 10 drives, we'd need multiple queries - for simplicity, batch
  let allDocs = filesSnap.docs;
  if (driveIds.length > 10) {
    const moreSnaps = await Promise.all(
      Array.from({ length: Math.ceil((driveIds.length - 10) / 10) }, (_, i) =>
        db
          .collection("backup_files")
          .where("userId", "==", uid)
          .where("deleted_at", "==", null)
          .where("linked_drive_id", "in", driveIds.slice(10 + i * 10, 10 + (i + 1) * 10))
          .get()
      )
    );
    allDocs = [...allDocs, ...moreSnaps.flatMap((s) => s.docs)];
  }

  const videoFiles = allDocs.filter((d) => {
    const data = d.data();
    const rel = (data.relative_path as string) ?? "";
    const mediaType = data.media_type as string | undefined;
    return (
      (isVideoPath(rel) || mediaType === "video") &&
      (data.object_key as string)
    );
  });

  const toProcess = videoFiles.slice(0, limit);
  const needProxy = await Promise.all(
    toProcess.map(async (doc) => {
      const objectKey = doc.data().object_key as string;
      const exists = await objectExists(getProxyObjectKey(objectKey));
      return exists ? null : doc;
    })
  );
  const docsToQueue = needProxy.filter((d): d is NonNullable<typeof d> => d !== null);

  for (const doc of docsToQueue) {
    const data = doc.data();
    const objectKey = data.object_key as string;
    const relativePath = (data.relative_path as string) ?? "";
    const fileName = relativePath.split("/").pop() ?? objectKey;
    await queueProxyJob({
      object_key: objectKey,
      name: fileName,
      backup_file_id: doc.id,
      user_id: uid,
      media_type: (data.media_type as string) ?? undefined,
    });
  }

  const enqueued = docsToQueue.length;

  return NextResponse.json({
    ok: true,
    enqueued,
    total_videos: videoFiles.length,
    message: `Enqueued ${enqueued} proxy jobs`,
  });
}
