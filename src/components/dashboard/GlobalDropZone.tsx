"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Upload } from "lucide-react";
import { useBackup } from "@/context/BackupContext";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useUppyUpload } from "@/context/UppyUploadContext";

/**
 * Global drag-and-drop zone for file uploads. Shows "Drop File to Upload" overlay
 * when dragging files over the page, then opens the Uppy uploader on drop.
 * Active on Home and All files views; uploads go to storage (or current folder when in All files).
 */
export default function GlobalDropZone() {
  const pathname = usePathname();
  const { linkedDrives, getOrCreateStorageDrive } = useBackup();
  const { currentDriveId, currentDrivePath } = useCurrentFolder();
  const { org } = useEnterprise();
  const openPanel = useUppyUpload()?.openPanel;

  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const isGalleryMediaDrive = Boolean(
    currentDriveId && linkedDrives.find((d) => d.id === currentDriveId)?.name === "Gallery Media"
  );

  const isActiveRoute = pathname
    ? (pathname === "/dashboard" ||
        pathname === "/dashboard/files" ||
        pathname?.startsWith("/enterprise") ||
        pathname?.startsWith("/desktop/app")) &&
      !pathname?.includes("/galleries/") &&
      !pathname?.includes("/transfers")
    : false;

  const shouldShowOverlay = isActiveRoute && !isGalleryMediaDrive;

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);

      if (!shouldShowOverlay || !openPanel) return;

      const files = e.dataTransfer?.files;
      if (!files?.length) return;

      const fileList = Array.from(files).filter((f) => f && f.size !== undefined);
      if (fileList.length === 0) return;

      try {
        const isFilesView =
          pathname === "/dashboard/files" ||
          pathname === "/enterprise/files" ||
          pathname === "/desktop/app/files";

        const driveId =
          currentDriveId &&
          linkedDrives.some((d) => d.id === currentDriveId && d.name !== "Gallery Media")
            ? currentDriveId
            : (await getOrCreateStorageDrive()).id;

        const pathPrefix = isFilesView ? (currentDrivePath ?? "") : "";
        const workspaceId =
          (pathname?.startsWith("/enterprise") || pathname?.startsWith("/desktop")) && org?.id
            ? org.id
            : null;

        openPanel(driveId, pathPrefix, workspaceId, {
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
      linkedDrives,
      getOrCreateStorageDrive,
      pathname,
      org?.id,
    ]
  );

  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      if (!shouldShowOverlay) return;
      if (!e.dataTransfer?.types?.includes("Files")) return;

      e.preventDefault();
      dragCounterRef.current += 1;
      setIsDragging(true);
    },
    [shouldShowOverlay]
  );

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
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

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm"
      aria-hidden
    >
      <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-white/50 bg-white/10 px-12 py-10">
        <Upload className="h-16 w-16 text-white" strokeWidth={1.5} />
        <p className="text-xl font-semibold text-white">Drop File to Upload</p>
        <p className="text-sm text-white/80">Release to open the uploader</p>
      </div>
    </div>
  );
}
