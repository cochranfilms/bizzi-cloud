"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface CurrentFolderContextValue {
  currentDriveId: string | null;
  currentDrivePath: string;
  setCurrentDrive: (id: string | null) => void;
  setCurrentDrivePath: (path: string) => void;
  selectedWorkspaceId: string | null;
  setSelectedWorkspaceId: (id: string | null) => void;
}

const CurrentFolderContext = createContext<CurrentFolderContextValue | null>(null);

export function CurrentFolderProvider({ children }: { children: React.ReactNode }) {
  const [currentDriveId, setCurrentDriveId] = useState<string | null>(null);
  const [currentDrivePath, setCurrentDrivePath] = useState("");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const setCurrentDrive = useCallback((id: string | null) => {
    setCurrentDriveId(id);
  }, []);
  const value = {
    currentDriveId,
    currentDrivePath,
    setCurrentDrive,
    setCurrentDrivePath,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
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
      selectedWorkspaceId: null,
      setSelectedWorkspaceId: () => {},
    }
  );
}
