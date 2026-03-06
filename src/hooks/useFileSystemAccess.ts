"use client";

import { useCallback, useState, useEffect } from "react";
import {
  saveHandle,
  getHandle,
  getHandleByLinkedDriveId,
  listHandles,
  removeHandle,
  type StoredHandle,
} from "@/lib/file-system-handle-store";

export const isFileSystemAccessSupported = () =>
  typeof window !== "undefined" &&
  "showDirectoryPicker" in window &&
  typeof (window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> })
    .showDirectoryPicker === "function";

export function useFileSystemAccess() {
  const [supported, setSupported] = useState(false);
  const [storedHandles, setStoredHandles] = useState<StoredHandle[]>([]);

  useEffect(() => {
    setSupported(isFileSystemAccessSupported());
    listHandles().then(setStoredHandles).catch(() => setStoredHandles([]));
  }, []);

  const pickDirectory = useCallback(async () => {
    if (!isFileSystemAccessSupported()) {
      throw new Error("File System Access API is not supported. Use Chrome or Edge.");
    }
    const picker = (window as Window & { showDirectoryPicker?: (opts?: { id?: string; mode?: "read" }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
    const handle = await picker!.call(window, { mode: "read" });
    return handle;
  }, []);

  const requestPermission = useCallback(
    async (handle: FileSystemDirectoryHandle): Promise<"granted" | "denied"> => {
      const permission = await handle.queryPermission({ mode: "read" });
      if (permission === "granted") return "granted";
      const requested = await handle.requestPermission({ mode: "read" });
      return requested === "granted" ? "granted" : "denied";
    },
    []
  );

  const saveHandleToStore = useCallback(
    async (
      id: string,
      linkedDriveId: string,
      name: string,
      handle: FileSystemDirectoryHandle
    ) => {
      await saveHandle(id, linkedDriveId, name, handle);
      setStoredHandles(await listHandles());
    },
    []
  );

  const getStoredHandle = useCallback(async (id: string) => {
    return getHandle(id);
  }, []);

  const getStoredHandleByDrive = useCallback(
    async (linkedDriveId: string) => {
      return getHandleByLinkedDriveId(linkedDriveId);
    },
    []
  );

  const deleteStoredHandle = useCallback(async (id: string) => {
    await removeHandle(id);
    setStoredHandles(await listHandles());
  }, []);

  return {
    supported,
    storedHandles,
    pickDirectory,
    requestPermission,
    saveHandleToStore: saveHandleToStore,
    getStoredHandle,
    getStoredHandleByDrive,
    deleteStoredHandle,
  };
}
