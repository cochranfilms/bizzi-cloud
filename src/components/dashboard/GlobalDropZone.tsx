"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Upload } from "lucide-react";
import { useBackup } from "@/context/BackupContext";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useUppyUpload } from "@/context/UppyUploadContext";
import { useAuth } from "@/context/AuthContext";
import { collectFilesFromDataTransfer } from "@/lib/browser-data-transfer-files";
import {
  resolveUploadDestination,
  getDropOverlayCopy,
  isCreatorMainRoute,
} from "@/lib/upload-destination-resolve";
import { creatorRawClientAllowsUploadAttempt } from "@/lib/creator-raw-upload-policy";
import { CREATOR_RAW_REJECTION_MESSAGES } from "@/lib/creator-raw-media-config";

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
    ? (pathname === "/dashboard" ||
        pathname === "/dashboard/files" ||
        pathname?.startsWith("/dashboard/creator") ||
        pathname?.startsWith("/enterprise") ||
        pathname?.startsWith("/desktop/app") ||
        pathname?.startsWith("/team/")) &&
      !pathname?.includes("/galleries/") &&
      !pathname?.includes("/transfers")
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
        const isFilesView =
          pathname === "/dashboard/files" ||
          pathname === "/enterprise/files" ||
          pathname === "/desktop/app/files" ||
          (!!pathname?.startsWith("/team/") && pathname.includes("/files"));

        const resolved = await resolveUploadDestination({
          pathname,
          searchParams,
          currentDriveId,
          currentDrivePath: currentDrivePath ?? "",
          linkedDrives,
          sourceSurface: isFilesView
            ? "files_global_drop"
            : isCreatorMainRoute(pathname)
              ? "creator_global_drop"
              : "home_global_drop",
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

        let files = fileList;
        if (resolved.destinationMode === "creator_raw" && resolved.isLocked) {
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

        if ((pathname?.startsWith("/enterprise") || pathname?.startsWith("/desktop")) && org?.id && user) {
          try {
            const token = await user.getIdToken();
            if (!token) throw new Error("Not authenticated");
            const params = new URLSearchParams({
              drive_id: finalDriveId,
              organization_id: org.id,
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
              initialFiles: files,
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
          initialFiles: files,
          storageFolderId: storageParentFolderId,
          storageFolderDisplayName: storageUploadFolderLabel,
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

  const nestedStorageDrop =
    subtitle.startsWith("Storage Drive:") || title.includes("Storage folder");

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/65 backdrop-blur-[2px]"
      aria-hidden
    >
      <div
        className={`mx-4 flex max-w-lg flex-col items-center gap-5 rounded-2xl border-2 border-dashed px-8 py-10 sm:px-12 ${
          nestedStorageDrop
            ? "border-sky-400/90 bg-sky-950/75 shadow-[0_0_0_1px_rgba(56,189,248,0.35),0_24px_64px_-12px_rgba(0,0,0,0.55)]"
            : "border-white/55 bg-white/10"
        }`}
      >
        <Upload
          className={`h-14 w-14 sm:h-16 sm:w-16 ${nestedStorageDrop ? "text-sky-200" : "text-white"}`}
          strokeWidth={1.5}
        />
        <p
          className={`text-center text-xl font-bold tracking-tight sm:text-2xl ${
            nestedStorageDrop ? "text-sky-50" : "text-white"
          }`}
        >
          {title}
        </p>
        <p
          className={`max-w-md text-center text-base font-semibold leading-snug sm:text-lg ${
            nestedStorageDrop ? "text-sky-100" : "text-white/85"
          }`}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}
