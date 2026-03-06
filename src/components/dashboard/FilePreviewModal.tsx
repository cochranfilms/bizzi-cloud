"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Download, FileIcon, Loader2 } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { RecentFile } from "@/hooks/useCloudFiles";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i;
const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac)$/i;
const PDF_EXT = /\.pdf$/i;

function getPreviewType(name: string): "image" | "video" | "audio" | "pdf" | "other" {
  const lower = name.toLowerCase();
  if (IMAGE_EXT.test(lower)) return "image";
  if (VIDEO_EXT.test(lower)) return "video";
  if (AUDIO_EXT.test(lower)) return "audio";
  if (PDF_EXT.test(lower)) return "pdf";
  return "other";
}

interface FilePreviewModalProps {
  file: RecentFile | null;
  onClose: () => void;
}

export default function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUrl = useCallback(async () => {
    if (!file?.objectKey) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken(true);
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/backup/preview-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          object_key: file.objectKey,
          user_id: getFirebaseAuth().currentUser?.uid,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load preview");
      setPreviewUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [file?.objectKey]);

  useEffect(() => {
    if (file) fetchUrl();
    else {
      setPreviewUrl(null);
      setError(null);
    }
  }, [file, fetchUrl]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  if (!file) return null;

  const previewType = getPreviewType(file.name);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
          <h2 className="truncate text-sm font-medium text-white" title={file.name}>
            {file.name}
          </h2>
          <div className="flex items-center gap-2">
            {previewUrl && (
              <a
                href={previewUrl}
                download={file.name}
                className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
                aria-label="Download"
              >
                <Download className="h-4 w-4" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex min-h-[40vh] flex-1 items-center justify-center overflow-auto bg-neutral-950 p-6">
          {loading && (
            <div className="flex flex-col items-center gap-3 text-neutral-400">
              <Loader2 className="h-10 w-10 animate-spin" />
              <p className="text-sm">Loading preview…</p>
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center gap-3 text-red-400">
              <FileIcon className="h-12 w-12" />
              <p className="text-sm">{error}</p>
              {previewUrl && (
                <a
                  href={previewUrl}
                  download={file.name}
                  className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-blue/90"
                >
                  Download
                </a>
              )}
            </div>
          )}
          {previewUrl && !loading && !error && (
            <>
              {previewType === "image" && (
                <img
                  src={previewUrl}
                  alt={file.name}
                  className="max-h-[70vh] max-w-full rounded-lg object-contain"
                />
              )}
              {previewType === "video" && (
                <video
                  src={previewUrl}
                  controls
                  className="max-h-[70vh] max-w-full rounded-lg"
                />
              )}
              {previewType === "audio" && (
                <div className="w-full max-w-md">
                  <audio src={previewUrl} controls className="w-full" />
                </div>
              )}
              {previewType === "pdf" && (
                <iframe
                  src={previewUrl}
                  title={file.name}
                  className="h-[70vh] w-full rounded-lg border-0"
                />
              )}
              {previewType === "other" && (
                <div className="flex flex-col items-center gap-4 text-neutral-400">
                  <FileIcon className="h-16 w-16" />
                  <p className="text-sm">Preview not available for this file type</p>
                  <a
                    href={previewUrl}
                    download={file.name}
                    className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-blue/90"
                  >
                    Download
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
