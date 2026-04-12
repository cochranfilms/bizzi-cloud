"use client";

import { useCallback, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Cloud, Loader2 } from "lucide-react";
import { useUppyUpload } from "@/context/UppyUploadContext";
import { useBackup } from "@/context/BackupContext";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useAuth } from "@/context/AuthContext";
import { openUploadPanelForCurrentRoute } from "@/lib/workspace-upload-panel-open";

/**
 * Minimal cloud control in the Workspace rail: opens upload destination or toggles the queue panel.
 */
export default function WorkspaceUploadDock() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { linkedDrives, getOrCreateStorageDrive, setFileUploadErrorMessage } = useBackup();
  const {
    currentDriveId,
    currentDrivePath,
    storageParentFolderId,
    storageUploadFolderLabel,
    selectedWorkspaceId,
  } = useCurrentFolder();
  const { org } = useEnterprise();
  const { user } = useAuth();
  const ctx = useUppyUpload();
  const [opening, setOpening] = useState(false);

  const isGalleryMediaDrive = Boolean(
    currentDriveId && linkedDrives.find((d) => d.id === currentDriveId)?.name === "Gallery Media"
  );

  const isActiveRoute = pathname
    ? (pathname.startsWith("/dashboard") ||
        pathname.startsWith("/enterprise") ||
        pathname.startsWith("/desktop/app") ||
        pathname.startsWith("/team/")) &&
      !pathname.includes("/galleries/") &&
      !pathname.includes("/transfers")
    : false;

  const isEnterpriseFilesNoDrive =
    pathname === "/enterprise/files" &&
    !searchParams?.get("drive") &&
    !searchParams?.get("drive_id");

  const shouldShow = isActiveRoute && !isGalleryMediaDrive && !isEnterpriseFilesNoDrive;

  const handleClick = useCallback(async () => {
    if (!ctx) return;
    const { openPanel, isUploadPanelOpen, toggleUploadQueueExpanded } = ctx;
    if (isUploadPanelOpen) {
      toggleUploadQueueExpanded();
      return;
    }
    if (!openPanel || opening) return;
    setOpening(true);
    try {
      await openUploadPanelForCurrentRoute({
        openPanel,
        pathname,
        searchParams,
        currentDriveId,
        currentDrivePath: currentDrivePath ?? "",
        linkedDrives,
        isEnterpriseFilesNoDrive,
        isGalleryMediaDrive,
        getOrCreateStorageDrive: async () => {
          const d = await getOrCreateStorageDrive();
          return { id: d.id, name: d.name };
        },
        orgId: org?.id,
        user,
        selectedWorkspaceId,
        storageParentFolderId,
        storageUploadFolderLabel,
        setFileUploadErrorMessage,
      });
    } finally {
      setOpening(false);
    }
  }, [
    pathname,
    searchParams,
    currentDriveId,
    currentDrivePath,
    linkedDrives,
    isEnterpriseFilesNoDrive,
    isGalleryMediaDrive,
    getOrCreateStorageDrive,
    org?.id,
    user,
    selectedWorkspaceId,
    storageParentFolderId,
    storageUploadFolderLabel,
    setFileUploadErrorMessage,
    opening,
    ctx,
  ]);

  if (!shouldShow || !ctx) return null;

  const { isUploadPanelOpen, uploadQueueExpanded, uploadDockSummary, workspaceUploadAnchorRef } =
    ctx;
  const busy =
    opening ||
    (isUploadPanelOpen &&
      uploadDockSummary.fileCount > 0 &&
      !uploadDockSummary.allComplete);

  return (
    <div ref={workspaceUploadAnchorRef} className="flex w-full justify-center pt-2 pb-1">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={opening}
        aria-expanded={isUploadPanelOpen ? uploadQueueExpanded : false}
        aria-label={
          isUploadPanelOpen
            ? uploadQueueExpanded
              ? "Hide upload queue"
              : "Show upload queue"
            : "Open file upload"
        }
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200/90 bg-neutral-100/95 text-neutral-700 shadow-sm ring-1 ring-neutral-200/70 transition-colors hover:bg-neutral-200/80 hover:text-neutral-900 disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-800/90 dark:text-neutral-200 dark:ring-neutral-600/80 dark:hover:bg-neutral-700 dark:hover:text-white"
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin text-[var(--enterprise-primary)]" aria-hidden />
        ) : (
          <Cloud className="h-5 w-5 text-[var(--enterprise-primary)]" strokeWidth={1.75} aria-hidden />
        )}
      </button>
    </div>
  );
}
