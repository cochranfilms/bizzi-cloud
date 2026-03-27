/** Custom DataTransfer type for dragging files/folders to move into another linked drive folder */
export const DND_MOVE_MIME = "application/x-bizzi-move-items" as const;

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
