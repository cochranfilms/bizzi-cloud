"use client";

import { Plus, Upload, Folder, Share2, Send, ChevronDown, Loader2, AlertCircle, X, Settings } from "lucide-react";
import Link from "next/link";
import { useState, useRef, useEffect, useContext, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import CreateTransferModal from "./CreateTransferModal";
import CreateFolderModal from "./CreateFolderModal";
import GalleryPickerModal from "./GalleryPickerModal";
import ShareModal from "./ShareModal";
import LayoutSettingsBar from "./LayoutSettingsBar";
import { useBackup } from "@/context/BackupContext";
import { useUppyUpload } from "@/context/UppyUploadContext";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useAuth } from "@/context/AuthContext";
import { FilesFilterTopChromeContext } from "@/context/FilesFilterTopChromeContext";
import { resolveUploadDestination } from "@/lib/upload-destination-resolve";
import { isLinkedDriveFolderModelV2 } from "@/lib/linked-drive-folder-model";

interface TopBarProps {
  title?: string;
  /** When true, shows View/Size/Ratio/Scale/Info controls in the top bar (left of New button) */
  showLayoutSettings?: boolean;
  /** Optional link to settings (e.g. /dashboard/creator/settings) - shows gear icon next to title */
  settingsHref?: string;
}

export default function TopBar({ title = "All files", showLayoutSettings = false, settingsHref }: TopBarProps) {
  const filesFilterTopChrome = useContext(FilesFilterTopChromeContext)?.chrome ?? null;
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [newDropdownOpen, setNewDropdownOpen] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createSharedFolderOpen, setCreateSharedFolderOpen] = useState(false);
  const [shareModalData, setShareModalData] = useState<{
    folderName: string;
    linkedDriveId: string;
    initialShareToken?: string;
  } | null>(null);
  const newDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isEnterpriseFilesNoDrive =
    pathname === "/enterprise/files" &&
    !searchParams?.get("drive") &&
    !searchParams?.get("drive_id");
  const showCreateTransfer =
    pathname === "/dashboard/transfers" || pathname === "/enterprise/transfers" || pathname === "/desktop/app/transfers";
  const {
    currentDriveId,
    currentDrivePath,
    storageParentFolderId,
    selectedWorkspaceId,
  } = useCurrentFolder();
  const {
    linkedDrives,
    uploadFiles,
    uploadFilesToGallery,
    fileUploadProgress,
    createFolder,
    bumpStorageVersion,
    fileUploadError,
    clearFileUploadError,
    setFileUploadErrorMessage,
    creatorRawDriveId,
    getOrCreateStorageDrive,
  } = useBackup();
  const { org } = useEnterprise();
  const { user } = useAuth();
  const [galleryPickerFiles, setGalleryPickerFiles] = useState<File[] | null>(null);
  const uppyUpload = useUppyUpload();
  const isRawFolder = creatorRawDriveId && currentDriveId === creatorRawDriveId;
  const isGalleryMediaDrive = Boolean(
    currentDriveId && linkedDrives.find((d) => d.id === currentDriveId)?.name === "Gallery Media"
  );
  const teamAwareTopBar = (n: string) => n.replace(/^\[Team\]\s+/, "");
  const onFilesRoute = Boolean(pathname?.includes("/files"));
  const currentLinkedForNested = currentDriveId
    ? linkedDrives.find((d) => d.id === currentDriveId)
    : undefined;
  const canCreateStorageNestedFolder =
    onFilesRoute &&
    !!currentDriveId &&
    !!currentLinkedForNested &&
    isLinkedDriveFolderModelV2(currentLinkedForNested) &&
    teamAwareTopBar(currentLinkedForNested.name) === "Storage";

  const resolveCanonicalStorageV2Drive = useCallback(() => {
    const candidates = linkedDrives.filter(
      (d) =>
        teamAwareTopBar(d.name) === "Storage" &&
        d.is_creator_raw !== true &&
        isLinkedDriveFolderModelV2(d)
    );
    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];
    const createdMs = (d: (typeof candidates)[0]) =>
      d.created_at ? Date.parse(d.created_at) : Number.MAX_SAFE_INTEGER;
    return candidates.reduce((a, b) => (createdMs(a) <= createdMs(b) ? a : b));
  }, [linkedDrives]);

  const createEmptyFolderSubmit = useCallback(
    async (folderName: string) => {
      const trimmed = folderName.trim();
      const isCreator =
        pathname === "/dashboard/creator" ||
        pathname === "/enterprise/creator" ||
        pathname === "/desktop/app/creator" ||
        (!!pathname?.startsWith("/team/") && pathname.includes("/creator"));

      if (isCreator) {
        await createFolder(trimmed || "New folder", { creatorSection: true });
        return;
      }

      if (canCreateStorageNestedFolder && currentDriveId && user) {
        const token = await user.getIdToken();
        const res = await fetch("/api/storage-folders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            linked_drive_id: currentDriveId,
            parent_folder_id: storageParentFolderId,
            name: trimmed || "Untitled folder",
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data.error as string) ?? "Could not create folder");
        }
        bumpStorageVersion();
        return;
      }

      const storageV2 = resolveCanonicalStorageV2Drive();
      if (storageV2 && user) {
        const token = await user.getIdToken();
        const res = await fetch("/api/storage-folders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            linked_drive_id: storageV2.id,
            parent_folder_id: null,
            name: trimmed || "Untitled folder",
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data.error as string) ?? "Could not create folder");
        }
        bumpStorageVersion();
        return;
      }

      await createFolder(trimmed || "New folder", undefined);
    },
    [
      pathname,
      canCreateStorageNestedFolder,
      currentDriveId,
      storageParentFolderId,
      user,
      createFolder,
      bumpStorageVersion,
      resolveCanonicalStorageV2Drive,
    ]
  );

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
    clearFileUploadError();
    if (isEnterpriseFilesNoDrive) return;
    if (isGalleryMediaDrive) {
      fileInputRef.current?.click();
      return;
    }

    const resolved = await resolveUploadDestination({
      pathname,
      searchParams,
      currentDriveId,
      currentDrivePath: currentDrivePath ?? "",
      linkedDrives,
      sourceSurface: "topbar_file_upload",
      isEnterpriseFilesNoDrive,
      isGalleryMediaDrive,
      getOrCreateStorageDrive: async () => {
        const d = await getOrCreateStorageDrive();
        return { id: d.id, name: d.name };
      },
    });

    if (!resolved.success) {
      setFileUploadErrorMessage(resolved.userMessage);
      return;
    }

    let driveId = resolved.driveId;
    let workspaceId: string | null = null;
    const panelOptionsBase = {
      uploadIntent: resolved.uploadIntent,
      lockedDestination: resolved.isLocked,
      sourceSurface: resolved.sourceSurface,
      destinationMode: resolved.destinationMode,
      routeContext: resolved.routeContext,
      targetDriveName: resolved.driveName,
      resolvedBy: resolved.resolvedBy,
      driveName: resolved.driveName,
    };

    if ((pathname.startsWith("/enterprise") || pathname.startsWith("/desktop")) && org?.id) {
      try {
        const token = await user?.getIdToken();
        if (!token) return;
        const params = new URLSearchParams({
          drive_id: driveId,
          organization_id: org.id,
        });
        if (selectedWorkspaceId) params.set("workspace_id", selectedWorkspaceId);
        const res = await fetch(
          `/api/workspaces/default-for-drive?${params}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Could not resolve workspace");
        }
        const data = (await res.json()) as {
          workspace_id: string;
          drive_id: string;
          drive_name?: string;
          workspace_name?: string;
          scope_label?: string;
        };
        workspaceId = data.workspace_id;
        driveId = data.drive_id ?? driveId;
        uppyUpload?.openPanel(driveId, resolved.pathPrefix, workspaceId, {
          ...panelOptionsBase,
          driveName: data.drive_name ?? panelOptionsBase.driveName,
          workspaceName: data.workspace_name ?? null,
          scopeLabel: data.scope_label ?? null,
          storageFolderId: storageParentFolderId,
        });
        return;
      } catch (err) {
        console.error("Workspace resolve failed:", err);
        setFileUploadErrorMessage("Could not resolve workspace for upload. Try again.");
        return;
      }
    }

    uppyUpload?.openPanel(driveId, resolved.pathPrefix, null, {
      ...panelOptionsBase,
      storageFolderId: storageParentFolderId,
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    const files = fileList ? Array.from(fileList) : [];
    e.target.value = "";
    if (files.length === 0) return;
    if (isGalleryMediaDrive) {
      setGalleryPickerFiles(files);
      return;
    }
    clearFileUploadError();
    const resolved = await resolveUploadDestination({
      pathname,
      searchParams,
      currentDriveId,
      currentDrivePath: currentDrivePath ?? "",
      linkedDrives,
      sourceSurface: "topbar_file_upload",
      isEnterpriseFilesNoDrive,
      isGalleryMediaDrive,
      getOrCreateStorageDrive: async () => {
        const d = await getOrCreateStorageDrive();
        return { id: d.id, name: d.name };
      },
    });
    if (!resolved.success) {
      setFileUploadErrorMessage(resolved.userMessage);
      return;
    }
    setFileUploading(true);
    uploadFiles(files, resolved.driveId).finally(() => setFileUploading(false));
  };

  const handleCreateFolderClick = () => {
    setNewDropdownOpen(false);
    setCreateFolderOpen(true);
  };

  const handleSharedFolderClick = () => {
    setNewDropdownOpen(false);
    setCreateSharedFolderOpen(true);
  };

  return (
    <div className="flex flex-shrink-0 flex-col border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-neutral-900/30">
      <div className="flex min-h-12 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 px-4 py-3 md:px-6">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-white truncate min-w-0">
            {title}
          </h1>
          {settingsHref && (
            <Link
              href={settingsHref}
              className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
              aria-label="Settings"
            >
              <Settings className="h-4 w-4" />
            </Link>
          )}
        </div>

      <div className="flex min-w-0 flex-1 flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3 md:gap-4">
        {filesFilterTopChrome}
        {showLayoutSettings && (
          <LayoutSettingsBar showViewMode={true} className="w-full py-0 sm:w-auto" />
        )}
      <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
        {showCreateTransfer ? (
            <button
              type="button"
              onClick={() => setTransferModalOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-bizzi-blue px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan touch-manipulation sm:w-auto sm:justify-start sm:px-4"
            >
              <Send className="h-4 w-4 flex-shrink-0" />
              <span className="hidden xs:inline">Create transfer</span>
              <span className="xs:hidden">New</span>
            </button>
        ) : (
          <div className="relative flex w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end" ref={newDropdownRef}>
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
            <div className="relative w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setNewDropdownOpen((o) => !o)}
              disabled={fileUploading || fileUploadProgress?.status === "in_progress"}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-bizzi-blue px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:cursor-not-allowed disabled:opacity-70 touch-manipulation sm:w-auto sm:justify-start sm:px-4"
            >
              {fileUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              New
              <ChevronDown className={`h-4 w-4 transition-transform ${newDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {newDropdownOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] w-full min-w-[calc(100vw-2rem)] sm:min-w-[180px] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
                {!canCreateStorageNestedFolder ? (
                  <button
                    type="button"
                    onClick={handleCreateFolderClick}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
                  >
                    <Folder className="h-4 w-4 flex-shrink-0" />
                    Create folder
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCreateFolderClick}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
                  >
                    <Folder className="h-4 w-4 flex-shrink-0" />
                    New folder in Storage
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleFileUploadClick}
                  disabled={fileUploading || isEnterpriseFilesNoDrive}
                  title={isEnterpriseFilesNoDrive ? "Select a drive first" : undefined}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
                >
                  <Upload className="h-4 w-4 flex-shrink-0" />
                  File Upload
                </button>
                <button
                  type="button"
                  onClick={handleSharedFolderClick}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
                >
                  <Share2 className="h-4 w-4 flex-shrink-0" />
                  Shared Folder
                </button>
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
      </div>

      <CreateTransferModal
        open={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
      />
      <CreateFolderModal
        open={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
        onCreateEmpty={async (folderName) => {
          await createEmptyFolderSubmit(folderName);
          setCreateFolderOpen(false);
        }}
      />

      <CreateFolderModal
        open={createSharedFolderOpen}
        onClose={() => setCreateSharedFolderOpen(false)}
        title="Create shared folder"
        defaultName="New shared folder"
        submitLabel="Create"
        onCreateEmpty={async (folderName) => {
          if (!user) return;
          const drive = await createFolder(folderName.trim() || "New shared folder", {
            forceLegacyLinkedDrive: true,
          });
          setCreateSharedFolderOpen(false);
          setShareModalData({
            folderName: folderName.trim() || drive.name,
            linkedDriveId: drive.id,
          });
        }}
      />

      {shareModalData && (
        <ShareModal
          open={!!shareModalData}
          onClose={() => setShareModalData(null)}
          folderName={shareModalData.folderName}
          linkedDriveId={shareModalData.linkedDriveId}
          initialShareToken={shareModalData.initialShareToken ?? undefined}
        />
      )}

      <GalleryPickerModal
        open={galleryPickerFiles !== null && galleryPickerFiles.length > 0}
        onClose={() => setGalleryPickerFiles(null)}
        files={galleryPickerFiles ?? []}
        onPick={(galleryId, galleryTitle, mediaFolderSegment) => {
          if (galleryPickerFiles?.length) {
            uploadFilesToGallery(galleryPickerFiles, galleryId, {
              galleryTitle,
              mediaFolderSegment: mediaFolderSegment ?? undefined,
            });
            setGalleryPickerFiles(null);
          }
        }}
      />

    </div>
  );
}
