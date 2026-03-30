"use client";

import { createContext, useCallback, useMemo, useState, type ReactNode } from "react";

type FilesFilterTopChromeContextValue = {
  chrome: ReactNode;
  setChrome: (node: ReactNode) => void;
};

export const FilesFilterTopChromeContext = createContext<FilesFilterTopChromeContextValue | null>(
  null
);

export function FilesFilterTopChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChromeState] = useState<ReactNode>(null);
  const setChrome = useCallback((node: ReactNode) => {
    setChromeState(node);
  }, []);
  const value = useMemo(() => ({ chrome, setChrome }), [chrome, setChrome]);
  return (
    <FilesFilterTopChromeContext.Provider value={value}>{children}</FilesFilterTopChromeContext.Provider>
  );
}
