/**
 * Broadcasts newly created Storage v2 folders so all {@link useCloudFiles} / FileGrid instances
 * can merge them immediately, before `storageVersion` refetches finish.
 */

export type StorageFolderCreatedPayload = {
  linked_drive_id: string;
  parent_folder_id: string | null;
  id: string;
  name: string;
};

type HomeRootListener = (payload: StorageFolderCreatedPayload) => void;
type GridListener = (payload: StorageFolderCreatedPayload) => void;

const homeRootListeners = new Set<HomeRootListener>();
const gridListeners = new Set<GridListener>();

export function registerOptimisticStorageHomeRootListener(fn: HomeRootListener): () => void {
  homeRootListeners.add(fn);
  return () => {
    homeRootListeners.delete(fn);
  };
}

export function registerOptimisticStorageGridListener(fn: GridListener): () => void {
  gridListeners.add(fn);
  return () => {
    gridListeners.delete(fn);
  };
}

export function notifyStorageFolderCreated(payload: StorageFolderCreatedPayload): void {
  if (!payload.linked_drive_id || !payload.id || !payload.name?.trim()) return;
  const normalized: StorageFolderCreatedPayload = {
    linked_drive_id: payload.linked_drive_id,
    parent_folder_id: payload.parent_folder_id ?? null,
    id: payload.id,
    name: payload.name.trim(),
  };
  if (normalized.parent_folder_id === null) {
    for (const fn of homeRootListeners) {
      try {
        fn(normalized);
      } catch {
        /* ignore */
      }
    }
  }
  for (const fn of gridListeners) {
    try {
      fn(normalized);
    } catch {
      /* ignore */
    }
  }
}
