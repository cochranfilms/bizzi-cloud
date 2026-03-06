import type { LocalStoreEntry, StoreStatus } from "@/types/mount";

export const STORE_STATUSES: StoreStatus[] = [
  "pending",
  "downloading",
  "completed",
  "error",
  "stale",
];

export function validateStoreStatus(s: unknown): s is StoreStatus {
  return typeof s === "string" && STORE_STATUSES.includes(s as StoreStatus);
}

export function validateLocalStoreEntry(entry: unknown): entry is LocalStoreEntry {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.user_id === "string" &&
    typeof e.device_id === "string" &&
    typeof e.file_id === "string" &&
    typeof e.object_key === "string" &&
    typeof e.relative_path === "string" &&
    typeof e.local_path === "string" &&
    validateStoreStatus(e.store_status) &&
    typeof e.store_progress === "number" &&
    typeof e.total_bytes === "number" &&
    typeof e.downloaded_bytes === "number" &&
    typeof e.created_at === "string" &&
    typeof e.updated_at === "string" &&
    typeof e.offline_available === "boolean" &&
    typeof e.stale === "boolean"
  );
}
