export interface LinkedDrive {
  id: string;
  user_id: string;
  name: string;
  mount_path: string | null;
  permission_handle_id: string | null;
  last_synced_at: string | null;
  created_at: string;
}

export interface BackupSnapshot {
  id: string;
  linked_drive_id: string;
  status: "in_progress" | "completed" | "failed";
  files_count: number;
  bytes_synced: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface BackupFile {
  id: string;
  backup_snapshot_id: string;
  linked_drive_id: string;
  relative_path: string;
  object_key: string;
  size_bytes: number;
  modified_at: string | null;
  checksum: string | null;
  created_at: string;
}

export interface SyncProgress {
  snapshotId: string;
  status: "in_progress" | "completed" | "failed";
  filesTotal: number;
  filesCompleted: number;
  bytesTotal: number;
  bytesSynced: number;
  currentFile: string | null;
  error?: string;
}

/** Per-file state for New button multi-file uploads. */
export interface FileUploadItem {
  id: string;
  name: string;
  size: number;
  bytesSynced: number;
  status: "pending" | "uploading" | "completed" | "cancelled" | "error";
  error?: string;
}

export interface FileUploadProgress {
  status: "in_progress" | "completed" | "failed";
  files: FileUploadItem[];
  bytesTotal: number;
  bytesSynced: number;
}
