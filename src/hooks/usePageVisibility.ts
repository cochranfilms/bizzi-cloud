"use client";

import { useEffect, useState } from "react";

/**
 * Returns whether the page/tab is currently visible.
 * Use for polling hooks: only poll when visible to avoid request storms
 * from background tabs and reduce unnecessary API load.
 */
export function usePageVisibility(): boolean {
  const [visible, setVisible] = useState(
    typeof document !== "undefined" ? !document.hidden : true
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  return visible;
}
