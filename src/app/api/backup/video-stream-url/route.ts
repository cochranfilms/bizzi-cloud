import { isB2Configured, objectExists, getProxyObjectKey } from "@/lib/b2";
import { getDownloadUrl } from "@/lib/cdn";
import { getMuxAssetStatus } from "@/lib/mux";
import { verifyBackupFileAccessWithGalleryFallbackAndLifecycle } from "@/lib/backup-access";
import { verifyIdToken, getAdminFirestore } from "@/lib/firebase-admin";
import { enqueueCreatorRawVideoProxyJob } from "@/lib/creator-raw-video-proxy-ingest";
import { queueProxyJob } from "@/lib/proxy-queue";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

const STREAM_EXPIRY_SEC = 3600; // 1 hour — aligned with preview-url; 10min caused Access Denied when users paused/returned

function backupDimensionsPayload(doc: { data: () => Record<string, unknown> } | undefined): {
  resolution_w?: number;
  resolution_h?: number;
} {
  if (!doc) return {};
  const d = doc.data();
  const rw = d.resolution_w;
  const rh = d.resolution_h;
  const o: { resolution_w?: number; resolution_h?: number } = {};
  if (typeof rw === "number" && Number.isFinite(rw)) o.resolution_w = rw;
  if (typeof rh === "number" && Number.isFinite(rh)) o.resolution_h = rh;
  return o;
}

async function driveIsCreatorRaw(linkedDriveId: string | undefined): Promise<boolean> {
  if (!linkedDriveId) return false;
  const db = getAdminFirestore();
  const s = await db.collection("linked_drives").doc(linkedDriveId).get();
  return s.exists === true && s.data()?.is_creator_raw === true;
}

/** If proxy is missing, ensure a Firestore job exists (self-heal). Creator RAW uses structured safety-net logging. */
async function ensureVideoProxyJobQueued(
  objectKey: string,
  uid: string,
  docs: Array<{ id: string; data: () => Record<string, unknown> }>
): Promise<void> {
  const doc = docs[0];
  if (!doc) return;
  const data = doc.data();
  const rel = (data.relative_path ?? "") as string;
  const name = rel.split("/").filter(Boolean).pop() ?? (data.name as string) ?? objectKey;
  const linkedDriveId = (data.linked_drive_id as string) ?? "";
  const raw = await driveIsCreatorRaw(linkedDriveId);
  if (raw) {
    await enqueueCreatorRawVideoProxyJob({
      driveIsCreatorRaw: true,
      objectKey,
      backupFileId: doc.id,
      userId: uid,
      relativePath: rel || name,
      source: "playback_safety_net",
    });
    return;
  }
  await queueProxyJob({
    object_key: objectKey,
    name,
    backup_file_id: doc.id,
    user_id: uid,
    media_type: "video",
  }).catch(() => {});
}

async function maybeLogCreatorRawMuxBeforeProxyRecord(
  doc: { id: string; data: () => Record<string, unknown> } | undefined,
  isHls: boolean
): Promise<void> {
  if (!doc || !isHls) return;
  const data = doc.data();
  const linkedDriveId = (data.linked_drive_id as string) ?? "";
  if (!(await driveIsCreatorRaw(linkedDriveId))) return;
  const proxyStatus = data.proxy_status as string | undefined;
  const hasProxyKey = Boolean(data.proxy_object_key);
  if (proxyStatus !== "ready" && !hasProxyKey) {
    console.warn(
      JSON.stringify({
        event: "creator_raw_mux_playable_before_proxy_record",
        backup_file_id: doc.id,
        object_key_prefix: (data.object_key as string)?.slice?.(0, 72),
      })
    );
  }
}

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
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { object_key: objectKey, user_id: userIdFromBody } = body;

  let uid: string;
  if (isDevAuthBypass() && typeof userIdFromBody === "string") {
    uid = userIdFromBody;
  } else {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
    }
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
  }

  if (!objectKey || typeof objectKey !== "string") {
    return NextResponse.json({ error: "object_key is required" }, { status: 400 });
  }

  const result = await verifyBackupFileAccessWithGalleryFallbackAndLifecycle(uid, objectKey);
  if (!result.allowed) {
    console.warn("[video-stream-url] Access denied", {
      uid,
      objectKeyPrefix: objectKey.slice(0, 50),
      status: result.status,
    });
    return NextResponse.json(
      { error: result.message ?? "Access denied" },
      { status: result.status ?? 403 }
    );
  }

  try {
    const db = getAdminFirestore();
    const muxSnap = await db
      .collection("backup_files")
      .where("object_key", "==", objectKey)
      .limit(5)
      .get();

    const muxDoc = muxSnap.docs.find((d) => d.data().mux_playback_id);
    const metaDoc = muxDoc ?? muxSnap.docs[0];
    const dim = backupDimensionsPayload(metaDoc);
    const muxPlaybackId = muxDoc?.data()?.mux_playback_id as string | undefined;
    const muxAssetId = muxDoc?.data()?.mux_asset_id as string | undefined;
    const storedStatus = muxDoc?.data()?.mux_status as string | undefined;

    if (muxPlaybackId && muxAssetId) {
      const status = storedStatus === "ready" ? "ready" : await getMuxAssetStatus(muxAssetId);
      if (status === "ready") {
        if (storedStatus !== "ready" && muxDoc) {
          muxDoc.ref.update({ mux_status: "ready" }).catch(() => {});
        }
        const streamUrl = `https://stream.mux.com/${muxPlaybackId}.m3u8?max_resolution=720p`;
        await maybeLogCreatorRawMuxBeforeProxyRecord(muxDoc ?? muxSnap.docs[0], true);
        return NextResponse.json({ streamUrl, isHls: true, ...dim });
      }
      // Mux not ready; fall back to 720p proxy if it exists (proxy pipeline may have completed)
      const proxyKey = getProxyObjectKey(objectKey);
      const proxyExists = await objectExists(proxyKey);
      if (proxyExists) {
        const streamUrl = await getDownloadUrl(proxyKey, STREAM_EXPIRY_SEC);
        return NextResponse.json({ streamUrl, ...dim });
      }
      await ensureVideoProxyJobQueued(objectKey, uid, muxSnap.docs);
      return NextResponse.json({
        processing: true,
        message: "Video is still processing. Check back soon to preview.",
        ...dim,
      });
    }

    const proxyKey = getProxyObjectKey(objectKey);
    const proxyExists = await objectExists(proxyKey);
    if (!proxyExists) {
      await ensureVideoProxyJobQueued(objectKey, uid, muxSnap.docs);
      return NextResponse.json({
        processing: true,
        message: "Generating preview. Check back in a moment.",
        estimatedSeconds: 60,
        ...dim,
      });
    }
    const streamUrl = await getDownloadUrl(proxyKey, STREAM_EXPIRY_SEC);
    return NextResponse.json({ streamUrl, ...dim });
  } catch (err) {
    console.error("[video-stream-url] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create stream URL" },
      { status: 500 }
    );
  }
}
