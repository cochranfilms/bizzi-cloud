/**
 * POST /api/conform/preview
 * Preview conform scope: validate assets, return counts without switching.
 * Used by UI to show ready/missing/invalid before user clicks Conform.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { getObjectMetadata, getProxyObjectKey } from "@/lib/b2";
import { MIN_PROXY_SIZE_BYTES } from "@/lib/format-detection";
import { validateAssetForConform } from "@/lib/conform/validation";
import { NextResponse } from "next/server";

const VIDEO_EXT =
  /\.(mp4|webm|ogg|mov|m4v|avi|mxf|mts|mkv|3gp|m2ts|mpg|mpeg|ts|flv|wmv|ogv|braw|r3d|ari|dng)$/i;

function isVideo(path: string): boolean {
  return VIDEO_EXT.test(path);
}

export async function POST(request: Request) {
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

  let body: { projectId: string; folderPath?: string | null; assetIds?: string[] | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { projectId, folderPath, assetIds } = body;
  if (!projectId || typeof projectId !== "string") {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  let docs = (
    await db
      .collection("backup_files")
      .where("userId", "==", uid)
      .where("linked_drive_id", "==", projectId)
      .where("deleted_at", "==", null)
      .get()
  ).docs;

  if (folderPath) {
    const prefix = folderPath.endsWith("/") ? folderPath : folderPath + "/";
    docs = docs.filter((d) => {
      const p = (d.data().relative_path as string) ?? "";
      return p === folderPath || p.startsWith(prefix);
    });
  }
  if (assetIds?.length) {
    const idSet = new Set(assetIds);
    docs = docs.filter((d) => idSet.has(d.id));
  }

  const videoFiles = docs.filter((d) => isVideo((d.data().relative_path as string) ?? ""));

  let ready = 0;
  let missing = 0;
  let invalid = 0;
  const invalidReasons: Array<{ name: string; reason: string }> = [];

  for (const doc of videoFiles) {
    const data = doc.data();
    const objectKey = data.object_key as string;
    const relativePath = (data.relative_path as string) ?? "";
    const displayName = relativePath.split("/").pop() ?? relativePath;
    const proxyObjectKey = (data.proxy_object_key as string) ?? getProxyObjectKey(objectKey);
    const proxyMeta = await getObjectMetadata(proxyObjectKey).catch(() => null);
    const hasProxy = !!proxyMeta && proxyMeta.contentLength >= MIN_PROXY_SIZE_BYTES;

    if (!hasProxy) {
      invalid++;
      const proxyStatus = data.proxy_status as string | undefined;
      const reason =
        proxyStatus === "pending" || proxyStatus === "processing"
          ? "Proxy still generating"
          : proxyStatus === "failed"
            ? "Proxy generation failed"
            : proxyStatus === "raw_unsupported"
              ? "RAW format (no proxy)"
              : "Proxy not ready or missing";
      invalidReasons.push({ name: displayName, reason });
      continue;
    }

    const validation = await validateAssetForConform({
      backupFileId: doc.id,
      objectKey,
      relativePath,
      proxyObjectKey,
      proxyStatus: data.proxy_status,
      durationSec: data.duration_sec,
      frameRate: data.frame_rate,
      audioChannels: data.audio_channels,
      proxyDurationSec: data.proxy_duration_sec,
      proxySizeBytes: data.proxy_size_bytes ?? proxyMeta?.contentLength,
    });

    if (validation.status === "ready") ready++;
    else if (validation.status === "missing_original") {
      missing++;
      invalidReasons.push({ name: displayName, reason: validation.reason ?? "Original missing" });
    } else {
      invalid++;
      invalidReasons.push({ name: displayName, reason: validation.reason ?? "Validation failed" });
    }
  }

  return NextResponse.json({
    totalClips: videoFiles.length,
    readyClips: ready,
    missingClips: missing,
    invalidClips: invalid,
    invalidReasons,
  });
}
