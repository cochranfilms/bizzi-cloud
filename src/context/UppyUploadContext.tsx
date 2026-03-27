"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
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

type PanelTarget = {
  open: boolean;
  driveId: string | null;
  pathPrefix: string;
  workspaceId: string | null;
  galleryId: string | null;
};

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
  /** Files dropped or chosen while the panel is open; drained by UppyUploadModal — not part of Uppy's instance key */
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [onUploadComplete, setOnUploadComplete] = useState<
    (() => void | Promise<void>) | null
  >(null);

  const panelRef = useRef<PanelTarget>({
    open: false,
    driveId: null,
    pathPrefix: "",
    workspaceId: null,
    galleryId: null,
  });

  useEffect(() => {
    panelRef.current = {
      open,
      driveId,
      pathPrefix,
      workspaceId,
      galleryId,
    };
  }, [open, driveId, pathPrefix, workspaceId, galleryId]);

  const { bumpStorageVersion } = useBackup();

  const openPanel = useCallback(
    (d: string, prefix = "", ws: string | null = null, options?: OpenPanelOptions) => {
      const galleryIdOpt = options?.galleryId ?? null;
      const p = panelRef.current;
      const same =
        p.open &&
        p.driveId === d &&
        p.pathPrefix === prefix &&
        p.workspaceId === ws &&
        p.galleryId === galleryIdOpt;

      const incoming = options?.initialFiles;
      if (same && incoming && incoming.length > 0) {
        setPendingFiles((prev) => [...prev, ...incoming]);
        setOpen(true);
        return;
      }

      if (same) {
        setOpen(true);
        return;
      }

      panelRef.current = {
        open: true,
        driveId: d,
        pathPrefix: prefix,
        workspaceId: ws,
        galleryId: galleryIdOpt,
      };

      setDriveId(d);
      setPathPrefix(prefix);
      setWorkspaceId(ws);
      setWorkspaceName(options?.workspaceName ?? null);
      setScopeLabel(options?.scopeLabel ?? null);
      setDriveName(options?.driveName ?? null);
      setGalleryId(galleryIdOpt);
      if (options && "onUploadComplete" in options) {
        setOnUploadComplete(options.onUploadComplete ?? null);
      }
      setPendingFiles(
        options?.initialFiles && options.initialFiles.length > 0 ? [...options.initialFiles] : []
      );
      setOpen(true);
    },
    []
  );

  const closePanel = useCallback(() => {
    panelRef.current = { ...panelRef.current, open: false };
    setOpen(false);
    setDriveId(null);
    setPathPrefix("");
    setWorkspaceId(null);
    setWorkspaceName(null);
    setScopeLabel(null);
    setDriveName(null);
    setGalleryId(null);
    setPendingFiles([]);
    setOnUploadComplete(null);
  }, []);

  const consumePendingFiles = useCallback(() => {
    setPendingFiles([]);
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
          pendingFiles={pendingFiles}
          onPendingFilesConsumed={consumePendingFiles}
          onUploadComplete={handleUploadComplete}
        />
      )}
    </UppyUploadContext.Provider>
  );
}
