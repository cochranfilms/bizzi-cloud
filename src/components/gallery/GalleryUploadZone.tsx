"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { useBackup } from "@/context/BackupContext";
import { useUppyUpload } from "@/context/UppyUploadContext";
import { GALLERY_UPLOAD_EXT_SET } from "@/lib/gallery-file-types";

interface GalleryUploadZoneProps {
  galleryId: string;
  galleryTitle?: string;
  onUploadComplete?: () => void;
  disabled?: boolean;
}

export default function GalleryUploadZone({
  galleryId,
  onUploadComplete,
  disabled,
}: GalleryUploadZoneProps) {
  const { getOrCreateGalleryDrive } = useBackup();
  const openPanel = useUppyUpload()?.openPanel;
  const [isDragging, setIsDragging] = useState(false);

  const handleOpenUppy = async (droppedFiles?: File[]) => {
    if (disabled || !openPanel) return;
    try {
      const drive = await getOrCreateGalleryDrive();
      const pathPrefix = galleryId;
      openPanel(drive.id, pathPrefix, null, {
        galleryId,
        initialFiles: droppedFiles && droppedFiles.length > 0 ? droppedFiles : undefined,
        onUploadComplete,
      });
    } catch (err) {
      console.error("Failed to open upload panel:", err);
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const accepted = Array.from(files).filter((f) => {
      const ext = f.name.toLowerCase().split(".").pop();
      return ext ? GALLERY_UPLOAD_EXT_SET.has(ext) : false;
    });
    if (accepted.length === 0) return;
    handleOpenUppy(accepted);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onClick = () => {
    if (disabled) return;
    handleOpenUppy();
  };

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors ${
          isDragging
            ? "border-bizzi-blue bg-bizzi-blue/5"
            : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
        } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <div className="p-8 text-center">
          <Upload className="mx-auto mb-3 h-12 w-12 text-neutral-400" />
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Drop photos and videos here, or click to browse
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            JPEG, PNG, GIF, WebP, RAW (ARW, CR2, CR3, NEF, DNG, etc.), MP4, MOV, WebM
          </p>
        </div>
      </div>
    </div>
  );
}
