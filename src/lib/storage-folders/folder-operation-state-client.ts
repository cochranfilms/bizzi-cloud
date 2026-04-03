/** Client-side check for storage_folders rows (plain objects from API). Mirrors server `operation_state` rules. */
export function storageFolderRowReadyForUi(row: Record<string, unknown>): boolean {
  const legacy = row.pending_operation as string | null | undefined;
  if (legacy) return false;
  const s = row.operation_state as string | undefined;
  if (s === "pending_move" || s === "pending_rename") return false;
  if (s === "ready") return true;
  return true;
}

export function storageFolderRowActiveForUi(row: Record<string, unknown>): boolean {
  return row.lifecycle_state === "active";
}
