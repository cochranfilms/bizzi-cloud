"use client";

/**
 * All Files view - full layout when at root.
 * Shows Pinned section and Recents/Hearts tabs.
 */
export default function AllFilesView({ children }: { children: React.ReactNode }) {
  return <div data-view="all-files" className="contents">{children}</div>;
}
