/**
 * Opens the global Uppy panel for the current route (no files, or with an initial batch).
 * Shared logic with GlobalDropZone so the Workspace dock matches drop / TopBar destinations.
 */

import type { User } from "firebase/auth";
import type { LinkedDrive } from "@/types/backup";
import type { OpenPanelOptions } from "@/context/UppyUploadContext";
import { resolveUploadDestination, isCreatorMainRoute } from "@/lib/upload-destination-resolve";
import { CREATOR_RAW_REJECTION_MESSAGES } from "@/lib/creator-raw-media-config";
import { creatorRawClientAllowsUploadAttempt } from "@/lib/creator-raw-upload-policy";

export type OpenUploadPanelFn = (
  driveId: string,
  pathPrefix?: string,
  workspaceId?: string | null,
  options?: OpenPanelOptions
) => void;

export async function openUploadPanelForCurrentRoute(args: {
  openPanel: OpenUploadPanelFn;
  pathname: string | null;
  searchParams: URLSearchParams | null;
  currentDriveId: string | null;
  currentDrivePath: string;
  linkedDrives: LinkedDrive[];
  isEnterpriseFilesNoDrive: boolean;
  isGalleryMediaDrive: boolean;
  getOrCreateStorageDrive: () => Promise<{ id: string; name: string }>;
  orgId: string | null | undefined;
  user: User | null;
  selectedWorkspaceId: string | null;
  storageParentFolderId: string | null;
  storageUploadFolderLabel: string | null;
  setFileUploadErrorMessage: (message: string) => void;
  /** Omit or empty = open panel so user can add files from the UI */
  initialFiles?: File[];
}): Promise<void> {
  const {
    openPanel,
    pathname,
    searchParams,
    currentDriveId,
    currentDrivePath,
    linkedDrives,
    isEnterpriseFilesNoDrive,
    isGalleryMediaDrive,
    getOrCreateStorageDrive,
    orgId,
    user,
    selectedWorkspaceId,
    storageParentFolderId,
    storageUploadFolderLabel,
    setFileUploadErrorMessage,
    initialFiles = [],
  } = args;

  const isFilesView =
    pathname === "/dashboard/files" ||
    pathname === "/enterprise/files" ||
    pathname === "/desktop/app/files" ||
    (!!pathname?.startsWith("/team/") && pathname.includes("/files"));

  const resolved = await resolveUploadDestination({
    pathname,
    searchParams,
    currentDriveId,
    currentDrivePath,
    linkedDrives,
    sourceSurface: isFilesView
      ? "files_global_drop"
      : isCreatorMainRoute(pathname)
        ? "creator_global_drop"
        : "home_global_drop",
    isEnterpriseFilesNoDrive,
    isGalleryMediaDrive,
    getOrCreateStorageDrive,
  });

  if (!resolved.success) {
    setFileUploadErrorMessage(resolved.userMessage);
    return;
  }

  let files = initialFiles;
  if (resolved.destinationMode === "creator_raw" && resolved.isLocked && files.length > 0) {
    const allowed = files.filter((f) => creatorRawClientAllowsUploadAttempt(f.name));
    const skipped = files.length - allowed.length;
    if (skipped > 0) {
      setFileUploadErrorMessage(
        `${skipped} file(s) skipped — ${CREATOR_RAW_REJECTION_MESSAGES.nonMediaLeaf}`
      );
    }
    files = allowed;
    if (files.length === 0) return;
  }

  let finalDriveId = resolved.driveId;
  let workspaceId: string | null = null;
  const panelOptionsBase: OpenPanelOptions = {
    uploadIntent: resolved.uploadIntent,
    lockedDestination: resolved.isLocked,
    sourceSurface: resolved.sourceSurface,
    destinationMode: resolved.destinationMode,
    routeContext: resolved.routeContext,
    targetDriveName: resolved.driveName,
    resolvedBy: resolved.resolvedBy,
    driveName: resolved.driveName,
  };

  if ((pathname?.startsWith("/enterprise") || pathname?.startsWith("/desktop")) && orgId && user) {
    try {
      const token = await user.getIdToken();
      if (!token) throw new Error("Not authenticated");
      const params = new URLSearchParams({
        drive_id: finalDriveId,
        organization_id: orgId,
      });
      if (selectedWorkspaceId) params.set("workspace_id", selectedWorkspaceId);
      const res = await fetch(`/api/workspaces/default-for-drive?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Could not resolve workspace");
      const data = (await res.json()) as {
        workspace_id: string;
        drive_id: string;
        drive_name?: string;
        workspace_name?: string;
        scope_label?: string;
      };
      workspaceId = data.workspace_id;
      finalDriveId = data.drive_id ?? finalDriveId;
      openPanel(finalDriveId, resolved.pathPrefix, workspaceId, {
        ...panelOptionsBase,
        ...(files.length > 0 ? { initialFiles: files } : {}),
        driveName: data.drive_name ?? panelOptionsBase.driveName,
        workspaceName: data.workspace_name ?? null,
        scopeLabel: data.scope_label ?? null,
        storageFolderId: storageParentFolderId,
        storageFolderDisplayName: storageUploadFolderLabel,
      });
      return;
    } catch (err) {
      console.error("Workspace resolve failed:", err);
      setFileUploadErrorMessage("Could not resolve workspace for upload. Try again.");
      return;
    }
  }

  openPanel(finalDriveId, resolved.pathPrefix, workspaceId, {
    ...panelOptionsBase,
    ...(files.length > 0 ? { initialFiles: files } : {}),
    storageFolderId: storageParentFolderId,
    storageFolderDisplayName: storageUploadFolderLabel,
  });
}
