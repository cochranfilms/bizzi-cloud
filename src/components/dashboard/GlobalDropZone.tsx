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

/**
 * Global drag-and-drop zone for file uploads. Shows "Drop File to Upload" overlay
 * when dragging files over the page, then opens the Uppy uploader on drop.
 * Active on Home and All files views; uploads go to storage (or current folder when in All files).
 */
export default function GlobalDropZone() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { linkedDrives, getOrCreateStorageDrive } = useBackup();
  const { currentDriveId, currentDrivePath, selectedWorkspaceId } = useCurrentFolder();
  const { org } = useEnterprise();
  const { user } = useAuth();
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

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);

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

        // Home: always Storage drive root. All files: current drive + folder (or Storage if none).
        const storageDrive = linkedDrives.find((d) => d.name === "Storage" || d.name === "Uploads");
        const effectiveDriveId =
          storageDrive?.id ?? (await getOrCreateStorageDrive()).id;
        const driveId = isFilesView
          ? currentDriveId &&
            linkedDrives.some((d) => d.id === currentDriveId && d.name !== "Gallery Media")
            ? currentDriveId
            : effectiveDriveId
          : effectiveDriveId;

        const pathPrefix = isFilesView ? (currentDrivePath ?? "") : "";
        let workspaceId: string | null = null;
        let finalDriveId = driveId;

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
            openPanel(finalDriveId, pathPrefix, workspaceId, {
              initialFiles: fileList,
              workspaceName: data.workspace_name ?? null,
              scopeLabel: data.scope_label ?? null,
              driveName: data.drive_name ?? null,
            });
            return;
          } catch (err) {
            console.error("Workspace resolve failed:", err);
            return;
          }
        }

        openPanel(finalDriveId, pathPrefix, workspaceId, {
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
      org?.id,
      user,
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
        <p className="text-xl font-semibold text-white">Drop files to upload</p>
        <p className="text-sm text-white/80">
          Release to add them to the uploader. Final Cut (.fcpbundle) and other macOS packages keep folder
          structure when the browser exposes the package as a directory.
        </p>
      </div>
    </div>
  );
}
