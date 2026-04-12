"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Cloud } from "lucide-react";
import { useBackup } from "@/context/BackupContext";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useEnterprise, useEnterpriseOptional } from "@/context/EnterpriseContext";
import { useUppyUpload } from "@/context/UppyUploadContext";
import { useAuth } from "@/context/AuthContext";
import { useDashboardAppearanceOptional } from "@/context/DashboardAppearanceContext";
import { usePersonalTeamWorkspace } from "@/context/PersonalTeamWorkspaceContext";
import { collectFilesFromDataTransfer } from "@/lib/browser-data-transfer-files";
import {
  resolveUploadDestination,
  getDropOverlayCopy,
  isCreatorMainRoute,
} from "@/lib/upload-destination-resolve";
import { openUploadPanelForCurrentRoute } from "@/lib/workspace-upload-panel-open";
import { resolveImmersiveWorkspaceAccent } from "@/lib/immersive-workspace-accent";

/**
 * Global drag-and-drop zone. Overlay copy and drop target both come from
 * resolveUploadDestination — one source of truth.
 */
export default function GlobalDropZone() {
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
  const openPanel = useUppyUpload()?.openPanel;
  const appearance = useDashboardAppearanceOptional();
  const enterpriseOptional = useEnterpriseOptional();
  const teamWs = usePersonalTeamWorkspace();

  const workspaceAccent = useMemo(
    () =>
      resolveImmersiveWorkspaceAccent({
        pathname,
        orgTheme: enterpriseOptional?.org?.theme ?? enterpriseOptional?.organization?.theme,
        teamThemeId: teamWs?.teamThemeId,
        dashboardAccentHex: appearance?.accentColor ?? "#00BFFF",
      }),
    [
      pathname,
      enterpriseOptional?.org?.theme,
      enterpriseOptional?.organization?.theme,
      teamWs?.teamThemeId,
      appearance?.accentColor,
    ]
  );

  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragCounterRef = useRef(0);
  const overlayCancelRef = useRef(0);
  const [dropOverlay, setDropOverlay] = useState<{ title: string; subtitle: string } | null>(
    null
  );

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

  const shouldShowOverlay =
    isActiveRoute && !isGalleryMediaDrive && !isEnterpriseFilesNoDrive;

  const refreshOverlayCopy = useCallback(async () => {
    const gen = ++overlayCancelRef.current;
    const resolved = await resolveUploadDestination({
      pathname,
      searchParams,
      currentDriveId,
      currentDrivePath: currentDrivePath ?? "",
      linkedDrives,
      sourceSurface: (() => {
        const files =
          pathname === "/dashboard/files" ||
          pathname === "/enterprise/files" ||
          pathname === "/desktop/app/files" ||
          (!!pathname?.startsWith("/team/") && pathname.includes("/files"));
        if (files) return "files_global_drop";
        if (isCreatorMainRoute(pathname)) return "creator_global_drop";
        return "home_global_drop";
      })(),
      isEnterpriseFilesNoDrive,
      isGalleryMediaDrive,
      getOrCreateStorageDrive: async () => {
        const d = await getOrCreateStorageDrive();
        return { id: d.id, name: d.name };
      },
    });
    if (gen !== overlayCancelRef.current) return;
    setDropOverlay(
      getDropOverlayCopy(resolved, {
        storageParentFolderId,
        storageFolderDisplayName: storageUploadFolderLabel,
      })
    );
  }, [
    pathname,
    searchParams,
    currentDriveId,
    currentDrivePath,
    linkedDrives,
    isEnterpriseFilesNoDrive,
    isGalleryMediaDrive,
    getOrCreateStorageDrive,
    storageParentFolderId,
    storageUploadFolderLabel,
  ]);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      isDraggingRef.current = false;
      setIsDragging(false);
      overlayCancelRef.current += 1;
      setDropOverlay(null);

      if (!shouldShowOverlay || !openPanel) return;

      let fileList: File[];
      try {
        fileList = await collectFilesFromDataTransfer(e.dataTransfer ?? null);
      } catch {
        const files = e.dataTransfer?.files;
        if (!files?.length) return;
        fileList = Array.from(files);
      }
      fileList = fileList.filter((f) => f && f.size !== undefined);
      if (fileList.length === 0) return;

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
          initialFiles: fileList,
        });
      } catch (err) {
        console.error("Global drop upload failed:", err);
      }
    },
    [
      shouldShowOverlay,
      openPanel,
      currentDriveId,
      currentDrivePath,
      selectedWorkspaceId,
      linkedDrives,
      getOrCreateStorageDrive,
      pathname,
      searchParams,
      org?.id,
      user,
      isEnterpriseFilesNoDrive,
      isGalleryMediaDrive,
      setFileUploadErrorMessage,
      storageParentFolderId,
      storageUploadFolderLabel,
    ]
  );

  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      if (!shouldShowOverlay) return;
      if (!e.dataTransfer?.types?.includes("Files")) return;

      e.preventDefault();
      dragCounterRef.current += 1;
      isDraggingRef.current = true;
      setIsDragging(true);
      if (dragCounterRef.current === 1) {
        setDropOverlay({
          title: "Drop files to upload",
          subtitle: "Resolving upload destination…",
        });
        void refreshOverlayCopy();
      }
    },
    [shouldShowOverlay, refreshOverlayCopy]
  );

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      isDraggingRef.current = false;
      setIsDragging(false);
      overlayCancelRef.current += 1;
      setDropOverlay(null);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const clearDragOverlay = useCallback(() => {
    dragCounterRef.current = 0;
    overlayCancelRef.current += 1;
    isDraggingRef.current = false;
    setIsDragging(false);
    setDropOverlay(null);
  }, []);

  /** Leaving a drag-active route must not leave an invisible full-screen blocker (z-[100]) behind. */
  useEffect(() => {
    if (!shouldShowOverlay) {
      clearDragOverlay();
    }
  }, [shouldShowOverlay, clearDragOverlay]);

  useEffect(() => {
    if (!shouldShowOverlay) return;

    const onDragEnter = (e: DragEvent) => handleDragEnter(e);
    const onDragLeave = (e: DragEvent) => handleDragLeave(e);
    const onDragOver = (e: DragEvent) => handleDragOver(e);
    const onDrop = (e: DragEvent) => handleDrop(e);

    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);

    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [shouldShowOverlay, handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  /**
   * dragenter/dragleave counters desync easily (Esc, drop outside window, child-element traversal).
   * dragend + Escape + tab hide recover a stuck overlay that would block all clicks while the app keeps updating.
   */
  useEffect(() => {
    if (!shouldShowOverlay) return;

    const onDragEndWindow = () => clearDragOverlay();
    window.addEventListener("dragend", onDragEndWindow, true);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearDragOverlay();
    };
    window.addEventListener("keydown", onKeyDown, true);

    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      if (dragCounterRef.current > 0 || isDraggingRef.current) clearDragOverlay();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("dragend", onDragEndWindow, true);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [shouldShowOverlay, clearDragOverlay]);

  if (!isDragging || !shouldShowOverlay) return null;

  const title = dropOverlay?.title ?? "Drop files to upload";
  const subtitle =
    dropOverlay?.subtitle ?? "Release to open the uploader.";

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/45 backdrop-blur-[2px]"
      aria-hidden
    >
      <div className="mx-4 flex max-w-lg flex-col items-center gap-5 px-4 text-center sm:px-6">
        <Cloud
          className="h-14 w-14 shrink-0 sm:h-16 sm:w-16"
          strokeWidth={1.5}
          style={{ color: workspaceAccent }}
        />
        <p className="text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</p>
        <p className="max-w-md text-base font-semibold leading-snug text-white/85 sm:text-lg">
          {subtitle}
        </p>
      </div>
    </div>
  );
}
