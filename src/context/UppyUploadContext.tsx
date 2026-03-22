"use client";

import { createContext, useContext, useState, useCallback } from "react";
import UppyUploadModal from "@/components/upload/UppyUploadModal";
import { useBackup } from "@/context/BackupContext";

export interface OpenPanelOptions {
  galleryId?: string;
  /** Files to add to Uppy when opening (e.g. from drop) */
  initialFiles?: File[];
  /** Called when upload completes (e.g. to refresh gallery) */
  onUploadComplete?: () => void | Promise<void>;
  /** Display name for upload destination (e.g. "Shared Library") */
  workspaceName?: string | null;
  /** Visibility scope label (e.g. "Shared Library", "Private") */
  scopeLabel?: string | null;
  /** Display name for drive (e.g. "Gallery Media", "RAW") */
  driveName?: string | null;
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
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [scopeLabel, setScopeLabel] = useState<string | null>(null);
  const [driveName, setDriveName] = useState<string | null>(null);
  const [galleryId, setGalleryId] = useState<string | null>(null);
  const [initialFiles, setInitialFiles] = useState<File[] | null>(null);
  const [onUploadComplete, setOnUploadComplete] = useState<
    (() => void | Promise<void>) | null
  >(null);

  const { bumpStorageVersion } = useBackup();

  const openPanel = useCallback(
    (d: string, prefix = "", ws: string | null = null, options?: OpenPanelOptions) => {
      setDriveId(d);
      setPathPrefix(prefix);
      setWorkspaceId(ws);
      setWorkspaceName(options?.workspaceName ?? null);
      setScopeLabel(options?.scopeLabel ?? null);
      setDriveName(options?.driveName ?? null);
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
    setWorkspaceName(null);
    setScopeLabel(null);
    setDriveName(null);
    setGalleryId(null);
    setInitialFiles(null);
    setOnUploadComplete(null);
  }, []);

  const handleUploadComplete = useCallback(async () => {
    bumpStorageVersion();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("storage-upload-complete"));
    }
    await onUploadComplete?.();
  }, [bumpStorageVersion, onUploadComplete]);

  return (
    <UppyUploadContext.Provider value={{ openPanel, closePanel }}>
      {children}
      {driveId && (
        <UppyUploadModal
          open={open}
          onClose={closePanel}
          driveId={driveId}
          pathPrefix={pathPrefix}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          scopeLabel={scopeLabel}
          driveName={driveName}
          galleryId={galleryId}
          initialFiles={initialFiles}
          onUploadComplete={handleUploadComplete}
        />
      )}
    </UppyUploadContext.Provider>
  );
}
