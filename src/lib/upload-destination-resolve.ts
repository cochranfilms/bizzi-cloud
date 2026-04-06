/**
 * Single resolver for web upload destinations (TopBar, GlobalDropZone, Uppy).
 * Creator RAW locks only when creator route AND active drive is is_creator_raw.
 */

import type { LinkedDrive } from "@/types/backup";
import {
  pickStrictPersonalStorageDrive,
  pickTeamWorkspaceStorageDrive,
} from "@/lib/pick-storage-drive";
import { isLinkedDriveFolderModelV2 } from "@/lib/linked-drive-folder-model";

export type DestinationMode =
  | "creator_raw"
  | "storage"
  | "gallery_media"
  | "enterprise_files"
  | "team_storage";

export type ResolvedBy =
  | "active_raw_drive"
  | "files_current_drive"
  | "storage_fallback"
  | "gallery_media"
  | "enterprise_blocked";

export type UploadSourceSurface =
  | "topbar_file_upload"
  | "creator_global_drop"
  | "files_global_drop"
  | "home_global_drop";

export type RouteContext =
  | "dashboard_creator"
  | "enterprise_creator"
  | "desktop_creator"
  | "team_creator"
  | "dashboard_files"
  | "enterprise_files"
  | "desktop_files"
  | "team_files"
  | "dashboard_home"
  | "enterprise_home"
  | "desktop_home"
  | "team_home"
  | "enterprise_blocked"
  | "other";

export const CREATOR_RAW_UPLOAD_INTENT = "creator_raw_video";

export type ResolvedUploadDestinationSuccess = {
  success: true;
  resolvedSuccessfully: true;
  driveId: string;
  driveName: string;
  destinationMode: DestinationMode;
  /** Aligns with workspace / billing concepts where useful */
  workspaceType: string;
  uploadIntent: string;
  isLocked: boolean;
  sourceSurface: UploadSourceSurface;
  routeContext: RouteContext;
  pathPrefix: string;
  resolvedBy: ResolvedBy;
};

export type ResolvedUploadDestinationFailure = {
  success: false;
  resolvedSuccessfully: false;
  errorCode: string;
  userMessage: string;
  resolvedBy?: ResolvedBy;
};

export type ResolveUploadDestinationResult =
  | ResolvedUploadDestinationSuccess
  | ResolvedUploadDestinationFailure;

export type ResolveUploadDestinationInput = {
  pathname: string | null;
  searchParams?: URLSearchParams | null;
  currentDriveId: string | null;
  currentDrivePath: string;
  linkedDrives: LinkedDrive[];
  sourceSurface: UploadSourceSurface;
  isEnterpriseFilesNoDrive: boolean;
  isGalleryMediaDrive: boolean;
  /** Required when resolver may need to create/fetch default Storage drive */
  getOrCreateStorageDrive: () => Promise<{ id: string; name: string }>;
};

/** Creator tab routes that can lock to RAW (excludes /creator/settings). */
export function isCreatorMainRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  const settingsPrefixes = [
    "/dashboard/creator/settings",
    "/enterprise/creator/settings",
    "/desktop/app/creator/settings",
  ];
  if (settingsPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return false;
  }
  if (pathname === "/dashboard/creator" || pathname.startsWith("/dashboard/creator/"))
    return true;
  if (pathname === "/enterprise/creator" || pathname.startsWith("/enterprise/creator/"))
    return true;
  if (pathname === "/desktop/app/creator" || pathname.startsWith("/desktop/app/creator/"))
    return true;
  if (/^\/team\/[^/]+\/creator\/settings(\/|$)/.test(pathname)) return false;
  if (/^\/team\/[^/]+\/creator\/?$/.test(pathname)) return true;
  if (/^\/team\/[^/]+\/creator\//.test(pathname)) return true;
  return false;
}

function computeRouteContext(
  pathname: string | null,
  isFilesView: boolean,
  isEnterpriseFilesNoDrive: boolean
): RouteContext {
  if (isEnterpriseFilesNoDrive) return "enterprise_blocked";
  if (!pathname) return "other";
  if (pathname.startsWith("/team/")) {
    if (isFilesView) return "team_files";
    if (isCreatorMainRoute(pathname)) return "team_creator";
    return "team_home";
  }
  if (pathname.startsWith("/enterprise")) {
    if (isFilesView) return "enterprise_files";
    if (
      pathname === "/enterprise/creator" ||
      pathname.startsWith("/enterprise/creator/")
    ) {
      return "enterprise_creator";
    }
    return "enterprise_home";
  }
  if (pathname.startsWith("/desktop/app")) {
    if (isFilesView) return "desktop_files";
    if (
      pathname === "/desktop/app/creator" ||
      pathname.startsWith("/desktop/app/creator/")
    ) {
      return "desktop_creator";
    }
    return "desktop_home";
  }
  if (isFilesView) return "dashboard_files";
  if (pathname === "/dashboard/creator" || pathname.startsWith("/dashboard/creator/"))
    return "dashboard_creator";
  return "dashboard_home";
}

function isFilesViewPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname === "/dashboard/files" ||
    pathname === "/enterprise/files" ||
    pathname === "/desktop/app/files" ||
    (!!pathname.startsWith("/team/") && pathname.includes("/files"))
  );
}

function teamOwnerFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = /^\/team\/([^/]+)/.exec(pathname);
  return m?.[1]?.trim() ?? null;
}

export type DropOverlayExtras = {
  /** Set when uploading into Storage folder model v2 nested folder */
  storageParentFolderId?: string | null;
  /** Resolved display name for that folder (from CurrentFolderContext) */
  storageFolderDisplayName?: string | null;
};

/** Overlay copy — keep short; nested Storage folders call out the folder name prominently. */
export function getDropOverlayCopy(
  result: ResolveUploadDestinationResult,
  extras?: DropOverlayExtras
): {
  title: string;
  subtitle: string;
} {
  if (!result.success) {
    return {
      title: "Cannot upload here",
      subtitle: result.userMessage,
    };
  }
  if (result.destinationMode === "creator_raw" && result.isLocked) {
    return {
      title: "Drop to upload into Creator RAW",
      subtitle: "Release to add files to your RAW library.",
    };
  }
  if (result.destinationMode === "storage" && extras?.storageParentFolderId) {
    const folder =
      extras.storageFolderDisplayName?.trim() || "This folder";
    return {
      title: "Upload to Storage folder",
      subtitle: `Storage Drive: ${folder} — release to open the uploader.`,
    };
  }
  const target = result.driveName || "Storage";
  return {
    title: "Drop files to upload",
    subtitle: `Destination: ${target}. Release to open the uploader.`,
  };
}

export async function resolveUploadDestination(
  input: ResolveUploadDestinationInput
): Promise<ResolveUploadDestinationResult> {
  const {
    pathname,
    currentDriveId,
    currentDrivePath,
    linkedDrives,
    sourceSurface,
    isEnterpriseFilesNoDrive,
    isGalleryMediaDrive,
    getOrCreateStorageDrive,
  } = input;

  const isFilesView = isFilesViewPath(pathname);
  const routeContext = computeRouteContext(pathname, isFilesView, isEnterpriseFilesNoDrive);

  if (isEnterpriseFilesNoDrive) {
    return {
      success: false,
      resolvedSuccessfully: false,
      errorCode: "ENTERPRISE_NO_DRIVE",
      userMessage: "Select a drive first before uploading.",
      resolvedBy: "enterprise_blocked",
    };
  }

  if (isGalleryMediaDrive && currentDriveId) {
    const g = linkedDrives.find((d) => d.id === currentDriveId);
    return {
      success: true,
      resolvedSuccessfully: true,
      driveId: currentDriveId,
      driveName: g?.name ?? "Gallery Media",
      destinationMode: "gallery_media",
      workspaceType: "gallery_media",
      uploadIntent: "gallery_media",
      isLocked: false,
      sourceSurface,
      routeContext,
      pathPrefix: isFilesView ? (currentDrivePath ?? "") : "",
      resolvedBy: "gallery_media",
    };
  }

  const activeDrive = currentDriveId
    ? linkedDrives.find((d) => d.id === currentDriveId)
    : undefined;
  const activeRawView =
    isCreatorMainRoute(pathname) &&
    Boolean(currentDriveId && activeDrive?.is_creator_raw === true);

  if (activeRawView) {
    if (!currentDriveId || !activeDrive?.is_creator_raw) {
      return {
        success: false,
        resolvedSuccessfully: false,
        errorCode: "CREATOR_RAW_INVALID",
        userMessage:
          "Creator RAW isn’t available right now. Wait a moment and try again, or refresh the page.",
        resolvedBy: "active_raw_drive",
      };
    }
    return {
      success: true,
      resolvedSuccessfully: true,
      driveId: currentDriveId,
      driveName: activeDrive.name ?? "RAW",
      destinationMode: "creator_raw",
      workspaceType: "creator_raw",
      uploadIntent: CREATOR_RAW_UPLOAD_INTENT,
      isLocked: true,
      sourceSurface,
      routeContext:
        routeContext === "team_creator"
          ? "team_creator"
          : routeContext === "enterprise_creator"
            ? "enterprise_creator"
            : routeContext === "desktop_creator"
              ? "desktop_creator"
              : "dashboard_creator",
      pathPrefix: "",
      resolvedBy: "active_raw_drive",
    };
  }

  const teamOwnerUid = teamOwnerFromPath(pathname);
  const storageDrive = teamOwnerUid
    ? pickTeamWorkspaceStorageDrive(linkedDrives, teamOwnerUid)
    : pickStrictPersonalStorageDrive(linkedDrives);

  if (isFilesView) {
    const validCurrent =
      currentDriveId &&
      linkedDrives.some((d) => d.id === currentDriveId && d.name !== "Gallery Media");
    if (validCurrent && currentDriveId) {
      const d = linkedDrives.find((x) => x.id === currentDriveId)!;
      const destinationMode: DestinationMode = teamOwnerUid ? "team_storage" : "storage";
      const pathPrefix = isLinkedDriveFolderModelV2(d) ? "" : (currentDrivePath ?? "");
      return {
        success: true,
        resolvedSuccessfully: true,
        driveId: currentDriveId,
        driveName: d.name,
        destinationMode,
        workspaceType: destinationMode,
        uploadIntent: destinationMode,
        isLocked: false,
        sourceSurface,
        routeContext,
        pathPrefix,
        resolvedBy: "files_current_drive",
      };
    }
    const fallback = storageDrive ?? (await getOrCreateStorageDrive());
    const destinationMode: DestinationMode = teamOwnerUid ? "team_storage" : "storage";
    return {
      success: true,
      resolvedSuccessfully: true,
      driveId: fallback.id,
      driveName: fallback.name ?? "Storage",
      destinationMode,
      workspaceType: destinationMode,
      uploadIntent: destinationMode,
      isLocked: false,
      sourceSurface,
      routeContext,
      pathPrefix: "",
      resolvedBy: "storage_fallback",
    };
  }

  const fallback = storageDrive ?? (await getOrCreateStorageDrive());
  const destinationMode: DestinationMode = teamOwnerUid ? "team_storage" : "storage";
  return {
    success: true,
    resolvedSuccessfully: true,
    driveId: fallback.id,
    driveName: fallback.name ?? "Storage",
    destinationMode,
    workspaceType: destinationMode,
    uploadIntent: destinationMode,
    isLocked: false,
    sourceSurface,
    routeContext,
    pathPrefix: "",
    resolvedBy: "storage_fallback",
  };
}
