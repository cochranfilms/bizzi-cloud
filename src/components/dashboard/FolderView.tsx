"use client";

/**
 * Folder view - lean layout when viewing inside a drive/folder.
 * Shows breadcrumb and folder contents. No Pinned section or Recents/Hearts tabs.
 */
export default function FolderView({ children }: { children: React.ReactNode }) {
  return <div data-view="folder" className="contents">{children}</div>;
}
