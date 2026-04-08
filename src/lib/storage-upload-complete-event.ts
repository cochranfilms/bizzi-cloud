/** Dispatched after each storage file finishes (debounced in Uppy) and on full batch complete. */
export const STORAGE_UPLOAD_COMPLETE_EVENT = "storage-upload-complete";

export type StorageUploadCompleteDetail = {
  driveId: string | null;
  workspaceId: string | null;
};

export function dispatchStorageUploadComplete(detail: StorageUploadCompleteDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STORAGE_UPLOAD_COMPLETE_EVENT, { detail }));
}
