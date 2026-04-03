import type { Timestamp } from "firebase-admin/firestore";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";

/** V2 folder model version stored on linked_drives.document */
export const FOLDER_MODEL_V1 = 1;
export const FOLDER_MODEL_V2 = 2;

export type StorageDriveType = "storage" | "raw" | "gallery";

export type StorageFolderNodeType = "folder";

export type StorageFolderOperationState = "ready" | "pending_move" | "pending_rename";

export interface StorageFolderDoc {
  linked_drive_id: string;
  parent_folder_id: string | null;
  node_type: StorageFolderNodeType;
  name: string;
  name_compare_key: string;
  path_ids: string[];
  path_names: string[];
  depth: number;
  owner_user_id: string;
  organization_id: string | null;
  personal_team_owner_id: string | null;
  drive_type: StorageDriveType;
  lifecycle_state: typeof BACKUP_LIFECYCLE_ACTIVE | "trashed";
  version: number;
  updated_at: Timestamp;
  created_at: Timestamp;
  /** Authoritative for mutations; sync ops in this codebase keep `ready` until async jobs use pending_* */
  operation_state: StorageFolderOperationState;
  operation_job_id?: string | null;
  /** @deprecated Use `operation_state`; still read for legacy rows */
  pending_operation?: "move" | "rename" | null;
}

export const SYNC_FOLDER_MOVE_MAX_DESCENDANTS = 500;
export const SYNC_FOLDER_MOVE_MAX_FILES = 2000;

export const COLLECTION_STORAGE_FOLDERS = "storage_folders";
