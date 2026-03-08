"use client";

import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { useBackup } from "@/context/BackupContext";

const ACCEPT = ".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov,.m4v,.avi";

interface GalleryUploadZoneProps {
  galleryId: string;
  onUploadComplete?: () => void;
  disabled?: boolean;
}

export default function GalleryUploadZone({
  galleryId,
  onUploadComplete,
  disabled,
}: GalleryUploadZoneProps) {
  const { uploadFilesToGallery, fileUploadProgress, cancelFileUpload } = useBackup();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const hasGalleryUpload = fileUploadProgress?.files.some(
    (f) => f.id?.startsWith("gallery-upload-")
  );
  const isUploading = hasGalleryUpload && fileUploadProgress?.status === "in_progress";

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const accepted = Array.from(files).filter((f) => {
      const ext = f.name.toLowerCase().split(".").pop();
      return ["jpg", "jpeg", "png", "gif", "webp", "mp4", "webm", "mov", "m4v", "avi"].includes(
        ext ?? ""
      );
    });
    if (accepted.length === 0) return;
    uploadFilesToGallery(accepted, galleryId, { onComplete: onUploadComplete });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isUploading) return;
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && !isUploading) setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  return (
    <div className="space-y-4">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors ${
          isDragging
            ? "border-bizzi-blue bg-bizzi-blue/5"
            : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
        } ${disabled || isUploading ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          disabled={disabled || isUploading}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="p-8 text-center">
          <Upload className="mx-auto mb-3 h-12 w-12 text-neutral-400" />
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Drop photos and videos here, or click to browse
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            JPEG, PNG, GIF, WebP, MP4, MOV, WebM
          </p>
        </div>
      </div>

      {isUploading && fileUploadProgress && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Uploading…</span>
            <button
              type="button"
              onClick={() =>
                fileUploadProgress.files
                  .filter((f) => f.id?.startsWith("gallery-upload-"))
                  .forEach((f) => cancelFileUpload(f.id))
              }
              className="text-xs text-neutral-500 hover:text-red-600"
            >
              Cancel
            </button>
          </div>
          <div className="mb-2 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
            <div
              className="h-full bg-bizzi-blue transition-all"
              style={{
                width: `${(fileUploadProgress.bytesSynced / fileUploadProgress.bytesTotal) * 100}%`,
              }}
            />
          </div>
          <div className="space-y-1">
            {fileUploadProgress.files
              .filter((f) => f.id?.startsWith("gallery-upload-"))
              .slice(0, 5)
              .map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400"
                >
                  {f.status === "completed" ? (
                    <span className="text-green-600 dark:text-green-400">✓</span>
                  ) : f.status === "uploading" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <span className="text-amber-600">⏳</span>
                  )}
                  <span className="truncate">{f.name}</span>
                </div>
              ))}
            {fileUploadProgress.files.filter((f) => f.id?.startsWith("gallery-upload-")).length >
              5 && (
              <p className="text-xs text-neutral-500">
                +{fileUploadProgress.files.filter((f) => f.id?.startsWith("gallery-upload-")).length - 5} more
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
