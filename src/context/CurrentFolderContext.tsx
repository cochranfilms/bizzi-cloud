"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface CurrentFolderContextValue {
  currentDriveId: string | null;
  currentDrivePath: string;
  setCurrentDrive: (id: string | null) => void;
  setCurrentDrivePath: (path: string) => void;
  /** storage_folders parent when browsing a folder model v2 drive (null = drive root) */
  storageParentFolderId: string | null;
  setStorageParentFolderId: (id: string | null) => void;
  selectedWorkspaceId: string | null;
  setSelectedWorkspaceId: (id: string | null) => void;
  /** When viewing a workspace on a different drive (e.g. Shared Library), use this drive for file queries */
  effectiveDriveIdForFiles: string | null;
  setEffectiveDriveIdForFiles: (id: string | null) => void;
}

const CurrentFolderContext = createContext<CurrentFolderContextValue | null>(null);

export function CurrentFolderProvider({ children }: { children: React.ReactNode }) {
  const [currentDriveId, setCurrentDriveId] = useState<string | null>(null);
  const [currentDrivePath, setCurrentDrivePath] = useState("");
  const [storageParentFolderId, setStorageParentFolderId] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [effectiveDriveIdForFiles, setEffectiveDriveIdForFiles] = useState<string | null>(null);
  const setCurrentDrive = useCallback((id: string | null) => {
    setCurrentDriveId(id);
  }, []);
  const value = {
    currentDriveId,
    currentDrivePath,
    setCurrentDrive,
    setCurrentDrivePath,
    storageParentFolderId,
    setStorageParentFolderId,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    effectiveDriveIdForFiles,
    setEffectiveDriveIdForFiles,
  };
  return (
    <CurrentFolderContext.Provider value={value}>
      {children}
    </CurrentFolderContext.Provider>
  );
}

export function useCurrentFolder() {
  const ctx = useContext(CurrentFolderContext);
  return (
    ctx ?? {
      currentDriveId: null,
      currentDrivePath: "",
      setCurrentDrive: () => {},
      setCurrentDrivePath: () => {},
      storageParentFolderId: null,
      setStorageParentFolderId: () => {},
      selectedWorkspaceId: null,
      setSelectedWorkspaceId: () => {},
      effectiveDriveIdForFiles: null,
      setEffectiveDriveIdForFiles: () => {},
    }
  );
}
