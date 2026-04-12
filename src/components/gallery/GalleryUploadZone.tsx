"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { useBackup } from "@/context/BackupContext";
import { useUppyUpload } from "@/context/UppyUploadContext";
import {
  GALLERY_UPLOAD_EXT_SET,
  isGalleryImage,
  isGalleryVideo,
} from "@/lib/gallery-file-types";
import { classifyGalleryFilename } from "@/lib/gallery-media-classification";
import {
  galleryUploadHelperMixed,
  galleryUploadHelperPhoto,
  galleryUploadHelperVideo,
} from "@/lib/gallery-profile-copy";
import { resolveMediaFolderSegmentForPath } from "@/lib/gallery-media-path";
import type { GalleryManageUploadLifecycleEvent } from "@/lib/gallery-manage-upload-lifecycle";

interface GalleryUploadZoneProps {
  galleryId: string;
  galleryTitle?: string;
  /** Persisted storage folder (from gallery document); title used as legacy fallback. */
  mediaFolderSegment?: string | null;
  onUploadComplete?: () => void;
  /** Refresh gallery assets as each file finishes (debounced in Uppy modal). */
  onGalleryAssetUploaded?: () => void | Promise<void>;
  onGalleryManageUploadLifecycle?: (event: GalleryManageUploadLifecycleEvent) => void;
  disabled?: boolean;
  /** From gallery profile — drives upload hints */
  mediaMode?: "final" | "raw";
  /** Restrict drop/browse to images vs videos (matches gallery_type) */
  galleryType?: "photo" | "video" | "mixed";
}

export default function GalleryUploadZone({
  galleryId,
  galleryTitle,
  mediaFolderSegment,
  onUploadComplete,
  onGalleryAssetUploaded,
  onGalleryManageUploadLifecycle,
  disabled,
  mediaMode = "final",
  galleryType = "photo",
}: GalleryUploadZoneProps) {
  const { getOrCreateGalleryDrive } = useBackup();
  const openPanel = useUppyUpload()?.openPanel;
  const [isDragging, setIsDragging] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const maybeWarnAboutFiles = (files: File[]) => {
    if (mediaMode === "final") {
      const rawPhotos = files.filter((f) => classifyGalleryFilename(f.name).isRawPhoto);
      if (rawPhotos.length > 0) {
        setHint(
          `This is a Final gallery: ${rawPhotos.length} file(s) look like camera RAW. They may not preview well here — use a RAW Photo Gallery for originals.`
        );
        window.setTimeout(() => setHint(null), 12000);
      }
    }
    if (mediaMode === "raw") {
      const nonRaw = files.filter(
        (f) => {
          const c = classifyGalleryFilename(f.name);
          return c.kind === "photo" && !c.isRawPhoto;
        }
      );
      if (nonRaw.length > 0) {
        setHint(
          `This is a RAW gallery: ${nonRaw.length} file(s) look like delivery stills (JPG/PNG, etc.). You can still upload them; previews will work normally.`
        );
        window.setTimeout(() => setHint(null), 10000);
      }
    }
  };

  const handleOpenUppy = async (droppedFiles?: File[]) => {
    if (disabled || !openPanel) return;
    if (droppedFiles?.length) {
      maybeWarnAboutFiles(Array.from(droppedFiles));
    }
    try {
      const drive = await getOrCreateGalleryDrive();
      const pathPrefix = resolveMediaFolderSegmentForPath(
        {
          id: galleryId,
          title: galleryTitle,
          media_folder_segment: mediaFolderSegment,
        },
        galleryId
      );
      openPanel(drive.id, pathPrefix, null, {
        galleryId,
        initialFiles: droppedFiles && droppedFiles.length > 0 ? droppedFiles : undefined,
        onUploadComplete,
        onGalleryAssetUploaded,
        onGalleryManageUploadLifecycle,
      });
    } catch (err) {
      console.error("Failed to open upload panel:", err);
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const accepted = Array.from(files).filter((f) => {
      const ext = f.name.toLowerCase().split(".").pop();
      if (!ext || !GALLERY_UPLOAD_EXT_SET.has(ext)) return false;
      if (galleryType === "photo") return isGalleryImage(f.name) && !isGalleryVideo(f.name);
      if (galleryType === "mixed")
        return (isGalleryImage(f.name) && !isGalleryVideo(f.name)) || isGalleryVideo(f.name);
      return isGalleryVideo(f.name);
    });
    if (accepted.length === 0) return;
    maybeWarnAboutFiles(accepted);
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

  const blurb =
    mediaMode === "raw"
      ? "Original camera files and source media; previews may use LUT on supported RAW when available."
      : "Edited, delivery ready photos and videos — best for client viewing.";

  const primaryLine =
    galleryType === "video"
      ? "Drop videos here, or click to browse"
      : galleryType === "mixed"
        ? "Drop photos or videos here, or click to browse"
        : "Drop photos here, or click to browse";
  const formatsLine =
    galleryType === "video"
      ? "MP4, MOV, WebM, M4V, AVI, MKV, and other supported video formats"
      : galleryType === "mixed"
        ? "Photos (JPEG, PNG, WebP, etc.) and videos (MP4, MOV, WebM, …)"
        : "JPEG, PNG, GIF, WebP, RAW (ARW, CR2, CR3, NEF, DNG, etc.)";

  const persistentHelper =
    galleryType === "video"
      ? galleryUploadHelperVideo(mediaMode)
      : galleryType === "mixed"
        ? galleryUploadHelperMixed()
        : galleryUploadHelperPhoto(mediaMode);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-200 bg-neutral-50/90 px-4 py-3 text-sm leading-relaxed text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800/50 dark:text-neutral-300">
        <p className="font-medium text-neutral-800 dark:text-neutral-200">Upload guidance</p>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">{persistentHelper}</p>
      </div>
      {hint && (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        >
          {hint}
        </div>
      )}
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
            {primaryLine}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {formatsLine}
          </p>
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-500">{blurb}</p>
        </div>
      </div>
    </div>
  );
}
