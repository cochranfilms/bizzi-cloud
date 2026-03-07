"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface CurrentFolderContextValue {
  currentDriveId: string | null;
  setCurrentDrive: (id: string | null) => void;
}

const CurrentFolderContext = createContext<CurrentFolderContextValue | null>(null);

export function CurrentFolderProvider({ children }: { children: React.ReactNode }) {
  const [currentDriveId, setCurrentDriveId] = useState<string | null>(null);
  const setCurrentDrive = useCallback((id: string | null) => {
    setCurrentDriveId(id);
  }, []);
  const value = { currentDriveId, setCurrentDrive };
  return (
    <CurrentFolderContext.Provider value={value}>
      {children}
    </CurrentFolderContext.Provider>
  );
}

export function useCurrentFolder() {
  const ctx = useContext(CurrentFolderContext);
  return ctx ?? { currentDriveId: null, setCurrentDrive: () => {} };
}
