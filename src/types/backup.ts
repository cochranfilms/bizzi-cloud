export interface LinkedDrive {
  id: string;
  user_id: string;
  name: string;
  mount_path: string | null;
  permission_handle_id: string | null;
  last_synced_at: string | null;
  created_at: string;
  /** null = personal storage; orgId = enterprise storage (billed at org level) */
  organization_id?: string | null;
  /** When true, drive appears only in Creator tab (excluded from All files) */
  creator_section?: boolean;
  /** When true, permanent RAW drive; video-only; cannot delete/rename */
  is_creator_raw?: boolean;
  /** Legacy org-only linked drives (no longer created). Omitted from enterprise UI lists. */
  is_org_shared?: boolean;
  /** Team shared drive: files uploaded from this drive attribute storage to this owner */
  personal_team_owner_id?: string | null;
  /** 2 = first-class storage_folders + folder_id on backup_files */
  folder_model_version?: number | null;
  supports_nested_folders?: boolean | null;
  /** Legacy custom drive consolidated into Storage v2; files live under this folder id */
  consolidated_into_storage_folder_id?: string | null;
  consolidated_into_linked_drive_id?: string | null;
  consolidated_at?: string | null;
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

import type { FileMetadataFields } from "./file-metadata";
import type { VisibilityScope } from "./workspace";

export interface BackupFile extends Partial<FileMetadataFields> {
  id: string;
  backup_snapshot_id: string;
  linked_drive_id: string;
  relative_path: string;
  /** Folder model v2: parent storage_folder id (null = drive root) */
  folder_id?: string | null;
  file_name?: string | null;
  file_name_compare_key?: string | null;
  object_key: string;
  size_bytes: number;
  modified_at: string | null;
  checksum: string | null;
  created_at: string;
  /** null = personal; orgId = enterprise (matches linked_drive) */
  organization_id?: string | null;
  /** When set, file is in Gallery Media and belongs to this gallery (stable across renames) */
  gallery_id?: string | null;
  /** Same `object_key` as source; row exists only to show linked assets under Gallery Media v2 folders */
  reference_source_backup_file_id?: string | null;
  /** Workspace this file belongs to (org files only) */
  workspace_id?: string | null;
  /** Denormalized visibility for queries */
  visibility_scope?: VisibilityScope | null;
  /** Uploader/owner (alias for userId for clarity) */
  owner_user_id?: string | null;
  /** Future: team scope */
  team_id?: string | null;
  /** Uploader’s team admin when file is in shared personal team storage */
  personal_team_owner_id?: string | null;
  /** Normalized container scope for lifecycle / policy */
  container_type?: "personal" | "organization" | "personal_team" | null;
  container_id?: string | null;
  uploader_email?: string | null;
  role_at_upload?: string | null;
  /** Future: project scope */
  project_id?: string | null;
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
