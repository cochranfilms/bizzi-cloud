"use client";

import { Plus, Upload, FolderPlus, Folder, Send, ChevronDown, Loader2, AlertCircle, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import CreateTransferModal from "./CreateTransferModal";
import CreateFolderModal from "./CreateFolderModal";
import GalleryPickerModal from "./GalleryPickerModal";
import { useBackup } from "@/context/BackupContext";
import { useUppyUpload } from "@/context/UppyUploadContext";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useEnterprise } from "@/context/EnterpriseContext";

interface TopBarProps {
  title?: string;
}

export default function TopBar({ title = "All files" }: TopBarProps) {
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [newDropdownOpen, setNewDropdownOpen] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [folderUploading, setFolderUploading] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const newDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const showCreateTransfer =
    pathname === "/dashboard/transfers" || pathname === "/enterprise/transfers" || pathname === "/desktop/app/transfers";
  const { currentDriveId } = useCurrentFolder();
  const {
    linkedDrives,
    uploadFiles,
    uploadFilesToGallery,
    fileUploadProgress,
    uploadFolder,
    createFolder,
    fileUploadError,
    clearFileUploadError,
    fsAccessSupported,
    syncProgress,
    creatorRawDriveId,
    getOrCreateStorageDrive,
    bumpStorageVersion,
  } = useBackup();
  const { org } = useEnterprise();
  const [galleryPickerFiles, setGalleryPickerFiles] = useState<File[] | null>(null);
  const uppyUpload = useUppyUpload();
  const isRawFolder = creatorRawDriveId && currentDriveId === creatorRawDriveId;
  const isGalleryMediaDrive = Boolean(
    currentDriveId && linkedDrives.find((d) => d.id === currentDriveId)?.name === "Gallery Media"
  );

  const formatBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (newDropdownRef.current && !newDropdownRef.current.contains(e.target as Node)) {
        setNewDropdownOpen(false);
      }
    }
    if (newDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [newDropdownOpen]);

  const handleFileUploadClick = async () => {
    setNewDropdownOpen(false);
    if (isGalleryMediaDrive) {
      fileInputRef.current?.click();
      return;
    }
    const driveId =
      currentDriveId && linkedDrives.some((d) => d.id === currentDriveId && d.name !== "Gallery Media")
        ? currentDriveId
        : (await getOrCreateStorageDrive()).id;
    const workspaceId =
      (pathname.startsWith("/enterprise") || pathname.startsWith("/desktop")) && org?.id ? org.id : null;
    uppyUpload?.openPanel(driveId, "", workspaceId);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    const files = fileList ? Array.from(fileList) : [];
    e.target.value = "";
    if (files.length === 0) return;
    if (isGalleryMediaDrive) {
      setGalleryPickerFiles(files);
      return;
    }
    setFileUploading(true);
    const driveId = currentDriveId ?? undefined;
    uploadFiles(files, driveId).finally(() => setFileUploading(false));
  };

  const handleCreateFolderClick = () => {
    setNewDropdownOpen(false);
    setCreateFolderOpen(true);
  };

  const handleFolderUploadClick = async () => {
    setNewDropdownOpen(false);
    if (!fsAccessSupported) return;
    setFolderUploading(true);
    try {
      await uploadFolder();
    } catch (err) {
      console.error(err);
    } finally {
      setFolderUploading(false);
    }
  };

  const showSyncProgress =
    syncProgress?.status === "in_progress" && syncProgress.bytesTotal > 0;

  return (
    <div className="flex flex-shrink-0 flex-col border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-neutral-900/30">
      <div className="flex min-h-12 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 px-4 py-3 md:px-6">
        <h1 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-white truncate min-w-0">
          {title}
        </h1>

      <div className="flex flex-wrap items-center gap-2">
        {showCreateTransfer ? (
            <button
              type="button"
              onClick={() => setTransferModalOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-bizzi-blue px-3 py-2 sm:px-4 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan touch-manipulation"
            >
              <Send className="h-4 w-4 flex-shrink-0" />
              <span className="hidden xs:inline">Create transfer</span>
              <span className="xs:hidden">New</span>
            </button>
        ) : (
          <div className="relative flex flex-col items-end gap-1" ref={newDropdownRef}>
            {fileUploadError && (
              <div className="flex w-full max-w-sm items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span className="flex-1">{fileUploadError}</span>
                <button
                  type="button"
                  onClick={clearFileUploadError}
                  className="flex-shrink-0 rounded p-0.5 hover:bg-red-200/50 dark:hover:bg-red-900/30"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="relative">
            <button
              type="button"
              onClick={() => setNewDropdownOpen((o) => !o)}
              disabled={fileUploading || folderUploading || (fileUploadProgress?.status === "in_progress")}
              className="flex items-center gap-2 rounded-lg bg-bizzi-blue px-3 py-2 sm:px-4 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:cursor-not-allowed disabled:opacity-70 touch-manipulation"
            >
              {(fileUploading || folderUploading) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              New
              <ChevronDown className={`h-4 w-4 transition-transform ${newDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {newDropdownOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] w-full min-w-[calc(100vw-2rem)] sm:min-w-[180px] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
                <button
                  type="button"
                  onClick={handleCreateFolderClick}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
                >
                  <Folder className="h-4 w-4 flex-shrink-0" />
                  Create New Folder
                </button>
                <button
                  type="button"
                  onClick={handleFileUploadClick}
                  disabled={fileUploading}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
                >
                  <Upload className="h-4 w-4 flex-shrink-0" />
                  File Upload
                </button>
                {!isRawFolder && (
                  <button
                    type="button"
                    onClick={handleFolderUploadClick}
                    disabled={folderUploading || !fsAccessSupported}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
                    title={!fsAccessSupported ? "Folder upload requires Chrome or Edge" : undefined}
                  >
                    <FolderPlus className="h-4 w-4 flex-shrink-0" />
                    Folder Upload
                  </button>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={isRawFolder ? "video/*,.mp4,.mov,.webm,.m4v,.avi,.mxf,.mts,.mkv,.3gp" : undefined}
              onChange={handleFileChange}
              className="hidden"
              aria-hidden
            />
            </div>
          </div>
        )}
      </div>
      </div>

      {showSyncProgress && syncProgress && (
        <div className="border-t border-neutral-100 px-4 pb-2 pt-1 md:px-6 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-xs text-neutral-600 dark:text-neutral-400">
              {syncProgress.currentFile}
            </span>
            <span className="shrink-0 text-xs font-medium text-neutral-700 dark:text-neutral-300">
              {formatBytes(syncProgress.bytesSynced)} / {formatBytes(syncProgress.bytesTotal)}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
            <div
              className="h-full rounded-full bg-bizzi-blue transition-all duration-150"
              style={{
                width: `${Math.min(100, (syncProgress.bytesSynced / syncProgress.bytesTotal) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      <CreateTransferModal
        open={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
      />
      <CreateFolderModal
        open={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
        onCreateEmpty={async (folderName) => {
          const isCreator = pathname === "/dashboard/creator" || pathname === "/enterprise/creator" || pathname === "/desktop/app/creator";
          await createFolder(folderName, isCreator ? { creatorSection: true } : undefined);
          setCreateFolderOpen(false);
        }}
      />

      <GalleryPickerModal
        open={galleryPickerFiles !== null && galleryPickerFiles.length > 0}
        onClose={() => setGalleryPickerFiles(null)}
        files={galleryPickerFiles ?? []}
        onPick={(galleryId, galleryTitle) => {
          if (galleryPickerFiles?.length) {
            uploadFilesToGallery(galleryPickerFiles, galleryId, { galleryTitle });
            setGalleryPickerFiles(null);
          }
        }}
      />

    </div>
  );
}
