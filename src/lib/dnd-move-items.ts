/** Custom DataTransfer type for dragging files/folders to move into another linked drive folder */
export const DND_MOVE_MIME = "application/x-bizzi-move-items" as const;

export type DragMovePayload = { fileIds: string[]; folderKeys: string[] };

/** Drop target for folder row/card: linked drive and optional Storage v2 `storage_folders` id (same drive). */
export type FolderDropMoveTarget = {
  driveId: string;
  storageFolderId?: string;
};

/** Persist payload for drop (custom MIME + text/plain fallback for browsers that omit custom types). */
export function setDragMovePayload(dt: DataTransfer, payload: DragMovePayload): void {
  const s = JSON.stringify(payload);
  dt.setData(DND_MOVE_MIME, s);
  dt.setData("text/plain", s);
}

/** Read payload from a drop event. */
export function getDragMovePayload(dt: DataTransfer): DragMovePayload | null {
  const raw = dt.getData(DND_MOVE_MIME) || dt.getData("text/plain");
  if (!raw?.trimStart().startsWith("{")) return null;
  try {
    const data = JSON.parse(raw) as { fileIds?: string[]; folderKeys?: string[] };
    const fileIds = Array.isArray(data.fileIds) ? data.fileIds : [];
    const folderKeys = Array.isArray(data.folderKeys) ? data.folderKeys : [];
    if (fileIds.length + folderKeys.length === 0) return null;
    return { fileIds, folderKeys };
  } catch {
    return null;
  }
}

/** Build move payload: if the dragged item is part of the current selection, move the whole selection; otherwise move only that item. */
export function getMovePayloadFromDragSource(
  sourceEl: HTMLElement,
  selectedFileIds: Set<string>,
  selectedFolderKeys: Set<string>
): { fileIds: string[]; folderKeys: string[] } | null {
  const type = sourceEl.getAttribute("data-item-type");
  const fileId = sourceEl.getAttribute("data-item-id");
  const folderKey = sourceEl.getAttribute("data-item-key");

  if (type === "file" && fileId) {
    if (selectedFileIds.has(fileId)) {
      return {
        fileIds: Array.from(selectedFileIds),
        folderKeys: Array.from(selectedFolderKeys),
      };
    }
    return { fileIds: [fileId], folderKeys: [] };
  }

  if (type === "folder" && folderKey) {
    if (selectedFolderKeys.has(folderKey)) {
      return {
        fileIds: Array.from(selectedFileIds),
        folderKeys: Array.from(selectedFolderKeys),
      };
    }
    return { fileIds: [], folderKeys: [folderKey] };
  }

  return null;
}
