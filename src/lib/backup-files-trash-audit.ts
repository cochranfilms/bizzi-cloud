import { logActivityEvent } from "@/lib/activity-log";
import type { BackupFileMutationSource } from "@/lib/backup-file-mutation-source";

export async function logBackupFilesTrashAudit(input: {
  actorUserId: string;
  kind: "moved_to_trash" | "restored_from_trash";
  fileCount: number;
  source: BackupFileMutationSource;
}): Promise<void> {
  const { actorUserId, kind, fileCount, source } = input;
  await logActivityEvent({
    event_type: kind === "moved_to_trash" ? "file_deleted" : "file_restored",
    actor_user_id: actorUserId,
    scope_type: "personal_account",
    metadata: {
      mutation_source: source,
      backup_file_count: fileCount,
      trash_operation: kind,
    },
  }).catch(() => {});
}
