const DB_NAME = "bizzi-backup-handles";
const DB_VERSION = 1;
const STORE_NAME = "handles";

export interface StoredHandle {
  id: string;
  linkedDriveId: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  storedAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

export async function saveHandle(
  id: string,
  linkedDriveId: string,
  name: string,
  handle: FileSystemDirectoryHandle
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const record: StoredHandle = {
      id,
      linkedDriveId,
      name,
      handle,
      storedAt: new Date().toISOString(),
    };
    const req = store.put(record);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

export async function getHandle(id: string): Promise<StoredHandle | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      resolve((req.result as StoredHandle) ?? null);
    };
    tx.oncomplete = () => db.close();
  });
}

export async function getHandleByLinkedDriveId(
  linkedDriveId: string
): Promise<StoredHandle | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    let result: StoredHandle | null = null;
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const record = cursor.value as StoredHandle;
        if (record.linkedDriveId === linkedDriveId) {
          result = record;
        }
        cursor.continue();
      } else {
        resolve(result);
      }
    };
    tx.oncomplete = () => db.close();
  });
}

export async function listHandles(): Promise<StoredHandle[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result ?? []);
    tx.oncomplete = () => db.close();
  });
}

export async function removeHandle(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}
