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
import type { GalleryManageUploadLifecycleEvent } from "@/lib/gallery-manage-upload-lifecycle";
import { dispatchStorageUploadComplete } from "@/lib/storage-upload-complete-event";

export interface OpenPanelOptions {
  galleryId?: string;
  /** Files to add to Uppy when opening (e.g. from drop) */
  initialFiles?: File[];
  /** Called when upload completes (e.g. to refresh gallery) */
  onUploadComplete?: () => void | Promise<void>;
  /**
   * Gallery uploads only: called (debounced inside the modal) after each file successfully
   * reaches storage and is linked to the gallery — keeps the asset grid live without waiting
   * for the full Uppy queue to finish. Does not bump global storage version.
   */
  onGalleryAssetUploaded?: () => void | Promise<void>;
  /** Optimistic manage-grid rows: Uppy file lifecycle while uploading to a gallery. */
  onGalleryManageUploadLifecycle?: (event: GalleryManageUploadLifecycleEvent) => void;
  /** Display name for upload destination (e.g. "Shared Library") */
  workspaceName?: string | null;
  /** Visibility scope label (e.g. "Shared Library", "Private") */
  scopeLabel?: string | null;
  /** Display name for drive (e.g. "Gallery Media", "RAW") */
  driveName?: string | null;
  /** Current Storage v2 folder display name when `storageFolderId` is set */
  storageFolderDisplayName?: string | null;
  /** Folder model v2: parent `storage_folders` id when uploading into a nested folder */
  storageFolderId?: string | null;
  /** Locked Creator RAW session metadata (single destination system) */
  uploadIntent?: string | null;
  lockedDestination?: boolean;
  sourceSurface?: string | null;
  destinationMode?: string | null;
  routeContext?: string | null;
  targetDriveName?: string | null;
  resolvedBy?: string | null;
}

type PanelTarget = {
  open: boolean;
  driveId: string | null;
  pathPrefix: string;
  storageFolderId: string | null;
  workspaceId: string | null;
  galleryId: string | null;
  uploadIntent: string | null;
  lockedDestination: boolean;
  sourceSurface: string | null;
  destinationMode: string | null;
  routeContext: string | null;
  targetDriveName: string | null;
  resolvedBy: string | null;
};

export type UppyUploadPanelTarget = {
  driveId: string;
  pathPrefix: string;
  storageFolderId: string | null;
};

interface UppyUploadContextValue {
  openPanel: (
    driveId: string,
    pathPrefix?: string,
    workspaceId?: string | null,
    options?: OpenPanelOptions
  ) => void;
  closePanel: () => void;
  /** True while the global Uppy modal is open (e.g. faster gallery asset polling during uploads). */
  isUploadPanelOpen: boolean;
  /** When the panel is open, the destination key so file views can suppress empty states during upload. */
  uploadPanelTarget: UppyUploadPanelTarget | null;
}

const UppyUploadContext = createContext<UppyUploadContextValue | null>(null);

export function useUppyUpload() {
  const ctx = useContext(UppyUploadContext);
  return ctx;
}

function sessionKeysMatch(a: PanelTarget, b: PanelTarget): boolean {
  return (
    a.driveId === b.driveId &&
    a.pathPrefix === b.pathPrefix &&
    a.storageFolderId === b.storageFolderId &&
    a.workspaceId === b.workspaceId &&
    a.galleryId === b.galleryId &&
    a.uploadIntent === b.uploadIntent &&
    a.lockedDestination === b.lockedDestination &&
    a.sourceSurface === b.sourceSurface &&
    a.destinationMode === b.destinationMode &&
    a.routeContext === b.routeContext
  );
}

/**
 * Renders the Uppy upload panel and provides context. State lives here so the
 * panel persists across tab/navigation changes (TopBar unmounts, Shell does not).
 */
export function UppyUploadProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [driveId, setDriveId] = useState<string | null>(null);
  const [pathPrefix, setPathPrefix] = useState("");
  const [storageFolderId, setStorageFolderId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [scopeLabel, setScopeLabel] = useState<string | null>(null);
  const [driveName, setDriveName] = useState<string | null>(null);
  const [storageFolderDisplayName, setStorageFolderDisplayName] = useState<string | null>(null);
  const [galleryId, setGalleryId] = useState<string | null>(null);
  const [uploadIntent, setUploadIntent] = useState<string | null>(null);
  const [lockedDestination, setLockedDestination] = useState(false);
  const [sourceSurface, setSourceSurface] = useState<string | null>(null);
  const [destinationMode, setDestinationMode] = useState<string | null>(null);
  const [routeContext, setRouteContext] = useState<string | null>(null);
  const [targetDriveName, setTargetDriveName] = useState<string | null>(null);
  const [resolvedBy, setResolvedBy] = useState<string | null>(null);
  /** Files dropped or chosen while the panel is open; drained by UppyUploadModal — not part of Uppy's instance key */
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [onUploadComplete, setOnUploadComplete] = useState<
    (() => void | Promise<void>) | null
  >(null);
  const [onGalleryAssetUploaded, setOnGalleryAssetUploaded] = useState<
    (() => void | Promise<void>) | null
  >(null);
  const [onGalleryManageUploadLifecycle, setOnGalleryManageUploadLifecycle] =
    useState<((event: GalleryManageUploadLifecycleEvent) => void) | null>(null);

  const panelRef = useRef<PanelTarget>({
    open: false,
    driveId: null,
    pathPrefix: "",
    storageFolderId: null,
    workspaceId: null,
    galleryId: null,
    uploadIntent: null,
    lockedDestination: false,
    sourceSurface: null,
    destinationMode: null,
    routeContext: null,
    targetDriveName: null,
    resolvedBy: null,
  });

  useEffect(() => {
    panelRef.current = {
      open,
      driveId,
      pathPrefix,
      storageFolderId,
      workspaceId,
      galleryId,
      uploadIntent,
      lockedDestination,
      sourceSurface,
      destinationMode,
      routeContext,
      targetDriveName,
      resolvedBy,
    };
  }, [
    open,
    driveId,
    pathPrefix,
    storageFolderId,
    workspaceId,
    galleryId,
    uploadIntent,
    lockedDestination,
    sourceSurface,
    destinationMode,
    routeContext,
    targetDriveName,
    resolvedBy,
  ]);

  const { bumpStorageVersion } = useBackup();

  const openPanel = useCallback(
    (d: string, prefix = "", ws: string | null = null, options?: OpenPanelOptions) => {
      const galleryIdOpt = options?.galleryId ?? null;
      const intent = options?.uploadIntent ?? null;
      const locked = options?.lockedDestination === true;
      const surface = options?.sourceSurface ?? null;
      const mode = options?.destinationMode ?? null;
      const rc = options?.routeContext ?? null;
      const tdn = options?.targetDriveName ?? null;
      const rb = options?.resolvedBy ?? null;

      const p = panelRef.current;
      const nextTarget: PanelTarget = {
        open: true,
        driveId: d,
        pathPrefix: prefix,
        storageFolderId: options?.storageFolderId ?? null,
        workspaceId: ws,
        galleryId: galleryIdOpt,
        uploadIntent: intent,
        lockedDestination: locked,
        sourceSurface: surface,
        destinationMode: mode,
        routeContext: rc,
        targetDriveName: tdn,
        resolvedBy: rb,
      };

      const same = p.open && sessionKeysMatch(p, nextTarget);

      const incoming = options?.initialFiles;
      if (same && incoming && incoming.length > 0) {
        setPendingFiles((prev) => [...prev, ...incoming]);
        if (options?.storageFolderDisplayName !== undefined) {
          setStorageFolderDisplayName(options.storageFolderDisplayName ?? null);
        }
        if (options && "onUploadComplete" in options) {
          setOnUploadComplete(options.onUploadComplete ?? null);
        }
        if (options && "onGalleryAssetUploaded" in options) {
          setOnGalleryAssetUploaded(options.onGalleryAssetUploaded ?? null);
        }
        if (options && "onGalleryManageUploadLifecycle" in options) {
          setOnGalleryManageUploadLifecycle(options.onGalleryManageUploadLifecycle ?? null);
        }
        setOpen(true);
        return;
      }

      if (same) {
        setOpen(true);
        return;
      }

      panelRef.current = nextTarget;

      setDriveId(d);
      setPathPrefix(prefix);
      setStorageFolderId(options?.storageFolderId ?? null);
      setWorkspaceId(ws);
      setWorkspaceName(options?.workspaceName ?? null);
      setScopeLabel(options?.scopeLabel ?? null);
      setDriveName(options?.driveName ?? null);
      setStorageFolderDisplayName(options?.storageFolderDisplayName ?? null);
      setGalleryId(galleryIdOpt);
      setUploadIntent(intent);
      setLockedDestination(locked);
      setSourceSurface(surface);
      setDestinationMode(mode);
      setRouteContext(rc);
      setTargetDriveName(tdn);
      setResolvedBy(rb);
      if (options && "onUploadComplete" in options) {
        setOnUploadComplete(options.onUploadComplete ?? null);
      }
      if (options && "onGalleryAssetUploaded" in options) {
        setOnGalleryAssetUploaded(options.onGalleryAssetUploaded ?? null);
      }
      if (options && "onGalleryManageUploadLifecycle" in options) {
        setOnGalleryManageUploadLifecycle(options.onGalleryManageUploadLifecycle ?? null);
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
    setStorageFolderId(null);
    setWorkspaceId(null);
    setWorkspaceName(null);
    setScopeLabel(null);
    setDriveName(null);
    setStorageFolderDisplayName(null);
    setGalleryId(null);
    setUploadIntent(null);
    setLockedDestination(false);
    setSourceSurface(null);
    setDestinationMode(null);
    setRouteContext(null);
    setTargetDriveName(null);
    setResolvedBy(null);
    setPendingFiles([]);
    setOnUploadComplete(null);
    setOnGalleryAssetUploaded(null);
    setOnGalleryManageUploadLifecycle(null);
  }, []);

  const consumePendingFiles = useCallback(() => {
    setPendingFiles([]);
  }, []);

  const handleUploadComplete = useCallback(async () => {
    bumpStorageVersion();
    const p = panelRef.current;
    dispatchStorageUploadComplete({
      driveId: p.driveId,
      workspaceId: p.workspaceId,
    });
    await onUploadComplete?.();
  }, [bumpStorageVersion, onUploadComplete]);

  const uploadPanelTarget: UppyUploadPanelTarget | null =
    open && driveId
      ? { driveId, pathPrefix, storageFolderId }
      : null;

  return (
    <UppyUploadContext.Provider
      value={{ openPanel, closePanel, isUploadPanelOpen: open, uploadPanelTarget }}
    >
      {children}
      {driveId && (
        <UppyUploadModal
          open={open}
          onClose={closePanel}
          driveId={driveId}
          pathPrefix={pathPrefix}
          storageFolderId={storageFolderId}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          scopeLabel={scopeLabel}
          driveName={driveName}
          storageFolderDisplayName={storageFolderDisplayName}
          galleryId={galleryId}
          uploadIntent={uploadIntent}
          lockedDestination={lockedDestination}
          sourceSurface={sourceSurface}
          destinationMode={destinationMode}
          routeContext={routeContext}
          targetDriveName={targetDriveName}
          resolvedBy={resolvedBy}
          pendingFiles={pendingFiles}
          onPendingFilesConsumed={consumePendingFiles}
          onUploadComplete={handleUploadComplete}
          onGalleryAssetUploaded={onGalleryAssetUploaded ?? undefined}
          onGalleryManageUploadLifecycle={onGalleryManageUploadLifecycle ?? undefined}
        />
      )}
    </UppyUploadContext.Provider>
  );
}
