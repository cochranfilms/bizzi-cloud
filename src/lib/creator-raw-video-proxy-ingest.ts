/**
 * Creator RAW product contract: every allowed video (including H.264 XAVC-S carve-outs)
 * must enter the proxy generation pipeline at ingest. Validation approval never bypasses proxies.
 */

import { isVideoFile } from "@/lib/bizzi-file-types";
import { queueProxyJob } from "@/lib/proxy-queue";

export type CreatorRawProxyEnqueueSource =
  | "ingest_presigned_complete"
  | "ingest_multipart_complete"
  | "ingest_extract_metadata_video"
  | "playback_safety_net"
  | "migration";

export function logCreatorRawProxyIngest(
  source: CreatorRawProxyEnqueueSource,
  payload: Record<string, unknown>
): void {
  const line = JSON.stringify({ scope: "creator_raw_proxy", source, ...payload });
  if (source === "playback_safety_net") {
    console.warn(`[creator_raw_proxy] ${line}`);
  } else {
    console.info(`[creator_raw_proxy] ${line}`);
  }
}

/**
 * Enqueue proxy generation for Creator RAW drives when the leaf is a video type.
 * Idempotent via queueProxyJob. Call from finalize routes (primary contract), extract-metadata,
 * or video-stream-url (safety net only).
 */
export async function enqueueCreatorRawVideoProxyJob(input: {
  driveIsCreatorRaw: boolean;
  objectKey: string;
  backupFileId: string;
  userId: string;
  relativePath: string;
  source: CreatorRawProxyEnqueueSource;
}): Promise<void> {
  if (!input.driveIsCreatorRaw) return;
  const leaf =
    input.relativePath.split("/").filter(Boolean).pop() ?? input.relativePath;
  if (!isVideoFile(leaf)) return;

  await queueProxyJob({
    object_key: input.objectKey,
    name: leaf,
    backup_file_id: input.backupFileId,
    user_id: input.userId,
    media_type: "video",
  }).catch(() => {});

  logCreatorRawProxyIngest(input.source, {
    backup_file_id: input.backupFileId,
    object_key_prefix: input.objectKey.slice(0, 72),
    leaf,
  });
}
