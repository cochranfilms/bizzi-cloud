import type { DocumentData } from "firebase-admin/firestore";
import { StorageFolderAccessError } from "./linked-drive-access";
import type { StorageFolderOperationState as OpState } from "./types";

/** Resolved state for mutation checks (legacy rows map to blocked when `pending_operation` was set). */
export function effectiveStorageFolderOperationState(
  data: DocumentData,
): OpState | "blocked_legacy" {
  const legacy = data.pending_operation as string | null | undefined;
  if (legacy) return "blocked_legacy";
  const s = data.operation_state as string | undefined;
  if (s === "pending_move" || s === "pending_rename") return s;
  if (s === "ready") return "ready";
  return "ready";
}

export function assertStorageFolderMutationReady(data: DocumentData): void {
  const s = effectiveStorageFolderOperationState(data);
  if (s !== "ready") {
    throw new StorageFolderAccessError("Folder is busy", 409);
  }
}
