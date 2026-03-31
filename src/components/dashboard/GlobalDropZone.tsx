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
import { isAllowedInCreatorRaw } from "@/lib/creator-raw-upload-policy";

/**
 * Global drag-and-drop zone. Overlay copy and drop target both come from
 * resolveUploadDestination — one source of truth.
 */
export default function GlobalDropZone() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { linkedDrives, getOrCreateStorageDrive, setFileUploadErrorMessage } = useBackup();
  const { currentDriveId, currentDrivePath, selectedWorkspaceId } = useCurrentFolder();
  const { org } = useEnterprise();
  const { user } = useAuth();
  const openPanel = useUppyUpload()?.openPanel;

  const [isDragging, setIsDragging] = useState(false);
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
    setDropOverlay(getDropOverlayCopy(resolved));
  }, [
    pathname,
    searchParams,
    currentDriveId,
    currentDrivePath,
    linkedDrives,
    isEnterpriseFilesNoDrive,
    isGalleryMediaDrive,
    getOrCreateStorageDrive,
  ]);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
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
          const allowed = files.filter((f) => isAllowedInCreatorRaw(f.name));
          const skipped = files.length - allowed.length;
          if (skipped > 0) {
            setFileUploadErrorMessage(
              `${skipped} file(s) skipped — Creator RAW accepts formats Bizzi can preview and grade. Upload unsupported files to Storage instead.`
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
    ]
  );

  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      if (!shouldShowOverlay) return;
      if (!e.dataTransfer?.types?.includes("Files")) return;

      e.preventDefault();
      dragCounterRef.current += 1;
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

  if (!isDragging) return null;

  const title = dropOverlay?.title ?? "Drop files to upload";
  const subtitle =
    dropOverlay?.subtitle ??
    "Release to add them to the uploader. Final Cut (.fcpbundle), Lightroom Library (.lrlibrary), and other macOS packages keep folder structure when supported.";

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm"
      aria-hidden
    >
      <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-white/50 bg-white/10 px-12 py-10">
        <Upload className="h-16 w-16 text-white" strokeWidth={1.5} />
        <p className="text-xl font-semibold text-white">{title}</p>
        <p className="max-w-lg text-center text-sm text-white/80">{subtitle}</p>
      </div>
    </div>
  );
}
