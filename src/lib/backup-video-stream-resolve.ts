/**
 * Dashboard backup video stream resolution (Mux → proxy → processing).
 * Shared by /api/backup/video-stream-url and /api/backup/asset-preview.
 */

import type { QuerySnapshot } from "firebase-admin/firestore";
import { getProxyObjectKey } from "@/lib/b2";
import { resolveProxyExistsForBackup } from "@/lib/asset-delivery-resolve";
import { getDownloadUrl } from "@/lib/cdn";
import { getMuxAssetStatus } from "@/lib/mux";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { BRAW_WORKER_NOT_CONFIGURED_USER_MESSAGE, isBrawMediaWorkerConfigured } from "@/lib/braw-media-worker";
import { enqueueCreatorRawVideoProxyJob } from "@/lib/creator-raw-video-proxy-ingest";
import { isBrawFile } from "@/lib/format-detection";
import { queueProxyJob } from "@/lib/proxy-queue";

export const BACKUP_STREAM_EXPIRY_SEC = 3600;

export function backupDimensionsFromDoc(doc: { data: () => Record<string, unknown> } | undefined): {
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

function leafFromObjectKey(key: string): string {
  return key.split("/").filter(Boolean).pop() ?? key;
}

function brawWorkerNotConfiguredPayload(
  objectKey: string,
  dim: ReturnType<typeof backupDimensionsFromDoc>
): Record<string, unknown> | null {
  if (!isBrawFile(leafFromObjectKey(objectKey)) || isBrawMediaWorkerConfigured()) return null;
  return {
    processing: false,
    proxyUnavailable: true,
    message: BRAW_WORKER_NOT_CONFIGURED_USER_MESSAGE,
    ...dim,
  };
}

function terminalProxyPreviewFailurePayload(
  metaDoc: { data: () => Record<string, unknown> } | undefined,
  dim: ReturnType<typeof backupDimensionsFromDoc>
): Record<string, unknown> | null {
  if (!metaDoc) return null;
  const d = metaDoc.data();
  const ps = d.proxy_status as string | undefined;
  if (ps !== "raw_unsupported" && ps !== "failed") return null;
  const reason = (d.proxy_error_reason as string | null) ?? null;
  const defaultMsg =
    ps === "raw_unsupported"
      ? "Cloud preview can’t decode this camera RAW with the current server setup. Download the original, or use the dedicated BRAW Linux worker."
      : reason?.includes("raw_decoder_unavailable")
        ? "Dedicated RAW transcode did not produce a proxy. Try Download, or verify MEDIA_BRAW_WORKER_SECRET and the Linux worker / Blackmagic RAW SDK pipeline."
        : "Proxy generation failed. Try Download, or try again later.";
  return {
    processing: false,
    proxyUnavailable: true,
    proxyStatus: ps,
    message: reason?.trim() ? reason : defaultMsg,
    ...dim,
  };
}

async function driveIsCreatorRaw(linkedDriveId: string | undefined): Promise<boolean> {
  if (!linkedDriveId) return false;
  const db = getAdminFirestore();
  const s = await db.collection("linked_drives").doc(linkedDriveId).get();
  return s.exists === true && s.data()?.is_creator_raw === true;
}

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

/**
 * @param muxSnap - `backup_files` query by object_key (limit 5), same as legacy route.
 */
export async function resolveBackupVideoStreamPayloadFromSnap(
  uid: string,
  objectKey: string,
  muxSnap: QuerySnapshot
): Promise<Record<string, unknown>> {
  const muxDoc = muxSnap.docs.find((d) => d.data().mux_playback_id);
  const metaDoc = muxDoc ?? muxSnap.docs[0];
  const dim = backupDimensionsFromDoc(metaDoc);
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
      return { streamUrl, isHls: true, ...dim };
    }
    const proxyKey = getProxyObjectKey(objectKey);
    const backupData = (metaDoc ?? muxSnap.docs[0])?.data() as Record<string, unknown> | undefined;
    const { exists: proxyExists } = await resolveProxyExistsForBackup(objectKey, backupData ?? null);
    if (proxyExists) {
      const streamUrl = await getDownloadUrl(proxyKey, BACKUP_STREAM_EXPIRY_SEC);
      return { streamUrl, ...dim };
    }
    const termMux = terminalProxyPreviewFailurePayload(metaDoc ?? muxSnap.docs[0], dim);
    if (termMux) return termMux;
    const brawNoWorkerMux = brawWorkerNotConfiguredPayload(objectKey, dim);
    if (brawNoWorkerMux) return brawNoWorkerMux;
    await ensureVideoProxyJobQueued(objectKey, uid, muxSnap.docs);
    return {
      processing: true,
      message: "Video is still processing. Check back soon to preview.",
      ...dim,
    };
  }

  const proxyKey = getProxyObjectKey(objectKey);
  const backupData = metaDoc?.data() as Record<string, unknown> | undefined;
  const { exists: proxyExists } = await resolveProxyExistsForBackup(objectKey, backupData ?? null);
  if (!proxyExists) {
    const term = terminalProxyPreviewFailurePayload(metaDoc, dim);
    if (term) return term;
    const brawNoWorker = brawWorkerNotConfiguredPayload(objectKey, dim);
    if (brawNoWorker) return brawNoWorker;
    await ensureVideoProxyJobQueued(objectKey, uid, muxSnap.docs);
    return {
      processing: true,
      message: "Generating preview. Check back in a moment.",
      estimatedSeconds: 60,
      ...dim,
    };
  }
  const streamUrl = await getDownloadUrl(proxyKey, BACKUP_STREAM_EXPIRY_SEC);
  return { streamUrl, ...dim };
}
