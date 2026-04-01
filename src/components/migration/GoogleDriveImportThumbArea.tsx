"use client";

import { useEffect, useRef, useState } from "react";
import { FolderOpen, Film, Image as ImageIcon, FileText, File as FileIcon, Archive, Music } from "lucide-react";
import {
  isVideoFile,
  isImageFile,
  isDocumentFile,
  isArchiveFile,
} from "@/lib/bizzi-file-types";

export type GoogleDriveBrowseEntry = {
  id: string;
  name: string;
  isFolder: boolean;
  mimeType?: string;
  thumbnailLink?: string;
  iconLink?: string;
  size?: string;
  modifiedTime?: string;
  path_lower?: string;
  imageMediaMetadata?: { width?: number; height?: number; time?: string };
};

export function formatGoogleDriveBytes(size?: string): string | null {
  const n = size != null ? parseInt(String(size), 10) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatGoogleDriveWhen(iso?: string): string | null {
  if (!iso || typeof iso !== "string") return null;
  const d = Date.parse(iso);
  if (!Number.isFinite(d)) return null;
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatGoogleDriveShortMime(mime?: string): string {
  if (!mime) return "";
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("audio/")) return "Audio";
  if (mime.startsWith("application/vnd.google-apps.")) return "Google app";
  const slash = mime.indexOf("/");
  if (slash > 0) return mime.slice(0, slash);
  return mime.length > 14 ? `${mime.slice(0, 12)}…` : mime;
}

function InternalTypeIcon({
  name,
  mimeType,
  className,
}: {
  name: string;
  mimeType?: string;
  className?: string;
}) {
  const cn = className ?? "h-8 w-8 text-neutral-400";
  if (mimeType?.startsWith("application/vnd.google-apps.")) {
    return <FileText className={cn} aria-hidden />;
  }
  if (mimeType?.startsWith("video/") || isVideoFile(name)) return <Film className={cn} aria-hidden />;
  if (mimeType?.startsWith("image/") || isImageFile(name)) return <ImageIcon className={cn} aria-hidden />;
  if (mimeType === "application/pdf" || /\.pdf$/i.test(name)) return <FileText className={cn} aria-hidden />;
  if (mimeType?.startsWith("audio/")) return <Music className={cn} aria-hidden />;
  if (isArchiveFile(name)) return <Archive className={cn} aria-hidden />;
  if (isDocumentFile(name)) return <FileText className={cn} aria-hidden />;
  return <FileIcon className={cn} aria-hidden />;
}

function useLazyInView(ref: React.RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setInView(true);
      },
      { rootMargin: "180px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, inView]);
  return inView;
}

/**
 * Loads preview bytes via the authenticated Bizzi proxy (Firebase Bearer on fetch, not on <img src>).
 */
function GoogleDriveProxiedPreview({
  fileId,
  variant,
  getAuthHeaders,
  imgClassName,
  onLoadFail,
}: {
  fileId: string;
  variant: "thumbnail" | "icon";
  getAuthHeaders: () => Promise<Record<string, string> | null>;
  imgClassName: string;
  onLoadFail: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const inView = useLazyInView(hostRef);
  const [src, setSrc] = useState<string | null>(null);
  const onFailRef = useRef(onLoadFail);
  onFailRef.current = onLoadFail;

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setSrc(null);
    (async () => {
      const h = await getAuthHeaders();
      if (!h || cancelled) {
        onFailRef.current();
        return;
      }
      const qs = new URLSearchParams({ fileId, variant });
      const res = await fetch(`/api/migrations/google-drive/thumbnail?${qs}`, { headers: h });
      if (!res.ok || cancelled) {
        onFailRef.current();
        return;
      }
      const blob = await res.blob();
      if (cancelled) return;
      if (!blob.size) {
        onFailRef.current();
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      if (cancelled) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setSrc(objectUrl);
    })().catch(() => {
      if (!cancelled) onFailRef.current();
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setSrc(null);
    };
  }, [inView, fileId, variant, getAuthHeaders]);

  return (
    <div ref={hostRef} className="absolute inset-0 flex items-center justify-center">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className={imgClassName}
          onError={() => onLoadFail()}
        />
      ) : null}
    </div>
  );
}

type GoogleDriveImportThumbAreaProps = {
  entry: GoogleDriveBrowseEntry;
  variant: "grid" | "list";
  /** When set, thumbnails/icons load through `/api/migrations/google-drive/thumbnail` with this auth. */
  previewAuth?: () => Promise<Record<string, string> | null>;
};

/**
 * Thumbnail / icon stack for Google Drive import browser: thumbnailLink → iconLink → Bizzi type icon.
 * Folders use a folder tile only (no Drive thumbnail).
 */
export function GoogleDriveImportThumbArea({ entry, variant, previewAuth }: GoogleDriveImportThumbAreaProps) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);

  useEffect(() => {
    setThumbFailed(false);
    setIconFailed(false);
  }, [entry.id, entry.thumbnailLink, entry.iconLink]);

  const thumb = entry.thumbnailLink?.trim();
  const icon = entry.iconLink?.trim();
  const useProxy = typeof previewAuth === "function";

  const box =
    variant === "grid"
      ? "aspect-square w-full rounded-xl bg-gradient-to-b from-neutral-100 to-neutral-50 dark:from-neutral-800 dark:to-neutral-900/90"
      : "h-12 w-12 shrink-0 rounded-lg bg-gradient-to-b from-neutral-100 to-neutral-50 dark:from-neutral-800 dark:to-neutral-900/90";

  if (entry.isFolder) {
    return (
      <div
        className={`flex items-center justify-center overflow-hidden ring-1 ring-inset ring-neutral-200/80 dark:ring-neutral-700/80 ${box}`}
      >
        <FolderOpen
          className={variant === "grid" ? "h-11 w-11 text-amber-500" : "h-7 w-7 text-amber-500"}
          aria-hidden
        />
      </div>
    );
  }

  if (thumb && !thumbFailed) {
    if (useProxy && previewAuth) {
      return (
        <div
          className={`relative overflow-hidden ring-1 ring-inset ring-neutral-200/80 dark:ring-neutral-700/80 ${box}`}
        >
          <GoogleDriveProxiedPreview
            fileId={entry.id}
            variant="thumbnail"
            getAuthHeaders={previewAuth}
            imgClassName="relative z-[1] h-full w-full object-cover"
            onLoadFail={() => setThumbFailed(true)}
          />
        </div>
      );
    }
    return (
      <div
        className={`relative overflow-hidden ring-1 ring-inset ring-neutral-200/80 dark:ring-neutral-700/80 ${box}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setThumbFailed(true)}
        />
      </div>
    );
  }

  if (icon && !iconFailed) {
    if (useProxy && previewAuth) {
      return (
        <div
          className={`relative flex items-center justify-center overflow-hidden ring-1 ring-inset ring-neutral-200/80 dark:ring-neutral-700/80 ${box}`}
        >
          <GoogleDriveProxiedPreview
            fileId={entry.id}
            variant="icon"
            getAuthHeaders={previewAuth}
            imgClassName="relative z-[1] max-h-[85%] max-w-[85%] object-contain"
            onLoadFail={() => setIconFailed(true)}
          />
        </div>
      );
    }
    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden ring-1 ring-inset ring-neutral-200/80 dark:ring-neutral-700/80 ${box}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={icon}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="max-h-[85%] max-w-[85%] object-contain"
          onError={() => setIconFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center overflow-hidden ring-1 ring-inset ring-neutral-200/80 dark:ring-neutral-700/80 ${box}`}
    >
      <InternalTypeIcon
        name={entry.name}
        mimeType={entry.mimeType}
        className={
          variant === "grid" ? "h-10 w-10 text-neutral-400 dark:text-neutral-500" : "h-7 w-7 text-neutral-400 dark:text-neutral-500"
        }
      />
    </div>
  );
}
