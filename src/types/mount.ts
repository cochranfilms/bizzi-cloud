export type FileStatus =
  | "cloud_only"
  | "partially_cached"
  | "stored_locally"
  | "modified_locally"
  | "syncing"
  | "offline_available"
  | "error";

export type StoreStatus =
  | "pending"
  | "downloading"
  | "completed"
  | "error"
  | "stale";

export interface LocalStoreEntry {
  id: string;
  user_id: string;
  device_id: string;
  file_id: string;
  folder_id?: string | null;
  object_key: string;
  relative_path: string;
  local_path: string;
  store_status: StoreStatus;
  store_progress: number;
  total_bytes: number;
  downloaded_bytes: number;
  checksum: string | null;
  created_at: string;
  updated_at: string;
  last_verified_at: string | null;
  offline_available: boolean;
  stale: boolean;
}

export interface StreamCacheEntry {
  key: string;
  object_key: string;
  start: number;
  end: number;
  local_path: string;
  size_bytes: number;
  last_accessed_at: number;
  created_at: number;
}

export const CHUNK_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB for video
export const DEFAULT_STREAM_CACHE_MAX_BYTES = 500 * 1024 * 1024 * 1024; // 500 GB for NLE editing
