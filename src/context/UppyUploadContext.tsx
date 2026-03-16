"use client";

import { createContext, useContext, useState, useCallback } from "react";
import UppyUploadModal from "@/components/upload/UppyUploadModal";
import { useBackup } from "@/context/BackupContext";
import { usePathname } from "next/navigation";
import { useEnterprise } from "@/context/EnterpriseContext";

export interface OpenPanelOptions {
  galleryId?: string;
  /** Files to add to Uppy when opening (e.g. from drop) */
  initialFiles?: File[];
  /** Called when upload completes (e.g. to refresh gallery) */
  onUploadComplete?: () => void | Promise<void>;
}

interface UppyUploadContextValue {
  openPanel: (
    driveId: string,
    pathPrefix?: string,
    workspaceId?: string | null,
    options?: OpenPanelOptions
  ) => void;
  closePanel: () => void;
}

const UppyUploadContext = createContext<UppyUploadContextValue | null>(null);

export function useUppyUpload() {
  const ctx = useContext(UppyUploadContext);
  return ctx;
}

/**
 * Renders the Uppy upload panel and provides context. State lives here so the
 * panel persists across tab/navigation changes (TopBar unmounts, Shell does not).
 */
export function UppyUploadProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [driveId, setDriveId] = useState<string | null>(null);
  const [pathPrefix, setPathPrefix] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [galleryId, setGalleryId] = useState<string | null>(null);
  const [initialFiles, setInitialFiles] = useState<File[] | null>(null);
  const [onUploadComplete, setOnUploadComplete] = useState<
    (() => void | Promise<void>) | null
  >(null);

  const { bumpStorageVersion } = useBackup();
  const pathname = usePathname();
  const { org } = useEnterprise();

  const isEnterpriseOrDesktop =
    pathname.startsWith("/enterprise") || pathname.startsWith("/desktop");

  const openPanel = useCallback(
    (d: string, prefix = "", ws: string | null = null, options?: OpenPanelOptions) => {
      setDriveId(d);
      setPathPrefix(prefix);
      setWorkspaceId(ws);
      setGalleryId(options?.galleryId ?? null);
      setInitialFiles(options?.initialFiles ?? null);
      setOnUploadComplete(options?.onUploadComplete ?? null);
      setOpen(true);
    },
    []
  );

  const closePanel = useCallback(() => {
    setOpen(false);
    setDriveId(null);
    setPathPrefix("");
    setWorkspaceId(null);
    setGalleryId(null);
    setInitialFiles(null);
    setOnUploadComplete(null);
  }, []);

  const handleUploadComplete = useCallback(async () => {
    bumpStorageVersion();
    await onUploadComplete?.();
  }, [bumpStorageVersion, onUploadComplete]);

  const effectiveWorkspaceId =
    isEnterpriseOrDesktop && org?.id ? org.id : null;

  return (
    <UppyUploadContext.Provider value={{ openPanel, closePanel }}>
      {children}
      {driveId && (
        <UppyUploadModal
          open={open}
          onClose={closePanel}
          driveId={driveId}
          pathPrefix={pathPrefix}
          workspaceId={workspaceId ?? effectiveWorkspaceId}
          galleryId={galleryId}
          initialFiles={initialFiles}
          onUploadComplete={handleUploadComplete}
        />
      )}
    </UppyUploadContext.Provider>
  );
}
