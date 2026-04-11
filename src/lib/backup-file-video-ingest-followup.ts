/**
 * After video metadata is known (sync extract-metadata or metadata-extraction worker complete):
 * enqueue proxy job, optional Creator RAW log, create Mux asset (admin path — no user JWT).
 */
import { logCreatorRawProxyIngest } from "@/lib/creator-raw-video-proxy-ingest";
import { createMuxAssetFromBackup } from "@/lib/mux";
import { queueProxyJob } from "@/lib/proxy-queue";

export type VideoIngestFollowupInput = {
  objectKey: string;
  fileName: string;
  backupFileId: string;
  userId: string;
  driveIsCreatorRaw: boolean;
};

export async function runVideoIngestFollowup(input: VideoIngestFollowupInput): Promise<void> {
  await queueProxyJob({
    object_key: input.objectKey,
    name: input.fileName,
    backup_file_id: input.backupFileId,
    user_id: input.userId,
    media_type: "video",
  }).catch(() => {});

  if (input.driveIsCreatorRaw) {
    logCreatorRawProxyIngest("ingest_extract_metadata_video", {
      backup_file_id: input.backupFileId,
      object_key_prefix: input.objectKey.slice(0, 72),
      note: "proxy_job_queued_with_standard_pipeline",
    });
  }

  await createMuxAssetFromBackup(input.objectKey, input.fileName, input.backupFileId).catch((e) => {
    console.error("[runVideoIngestFollowup] Mux create failed:", e);
  });
}
