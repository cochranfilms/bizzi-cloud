"use client";

import { useCallback, useState } from "react";
import type { User } from "firebase/auth";

const DOWNLOAD_LIMIT = 50;
const BULK_ZIP_RETRIES = 4;
const BULK_ZIP_RETRY_DELAY_MS = 3000;

function isNotReadableError(err: unknown): boolean {
  if (err instanceof DOMException) return err.name === "NotReadableError";
  return err instanceof Error && err.name === "NotReadableError";
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && err.message === "network error") return true;
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    return m.includes("network error") || m.includes("quic") || m.includes("failed to fetch");
  }
  return false;
}

export interface UseGalleryBulkDownloadOptions {
  galleryId: string;
  password?: string | null;
  user: User | null;
  onComplete?: () => void;
}

export function useGalleryBulkDownload({
  galleryId,
  password,
  user,
  onComplete,
}: UseGalleryBulkDownloadOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(
    async (
      items: { object_key: string; name: string }[],
      downloadContext: "full" | "selected"
    ) => {
      if (items.length === 0) return;
      if (items.length > DOWNLOAD_LIMIT) {
        setError(`Download supports up to ${DOWNLOAD_LIMIT} files at once`);
        return;
      }

      setIsLoading(true);
      setError(null);
      const baseUrl =
        typeof window !== "undefined" ? window.location.origin : "";
      try {
        const token = user ? (await user.getIdToken(true)) ?? null : null;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) headers.Authorization = `Bearer ${token}`;

        // Single file: download directly without zip
        if (items.length === 1) {
          const [item] = items;
          const res = await fetch(
            `${baseUrl}/api/galleries/${galleryId}/download`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                object_key: item.object_key,
                name: item.name,
                password: password ?? undefined,
                download_context: downloadContext,
              }),
            }
          );
          const json = (await res.json().catch(() => ({}))) as {
            url?: string;
            error?: string;
            message?: string;
          };
          if (!res.ok) {
            throw new Error(json.message ?? json.error ?? "Download failed");
          }
          const url = json.url;
          if (!url) throw new Error("No download URL returned");
          const fullUrl = url.startsWith("/") ? `${baseUrl}${url}` : url;
          const a = document.createElement("a");
          a.href = fullUrl;
          a.download = item.name;
          a.rel = "noopener noreferrer";
          a.click();
          onComplete?.();
          return;
        }

        // Multiple files: try bulk zip first (same workflow as transfers)
        let lastErr: unknown;
        for (let attempt = 1; attempt <= BULK_ZIP_RETRIES; attempt++) {
          try {
            const res = await fetch(
              `${baseUrl}/api/galleries/${galleryId}/download-bulk-zip`,
              {
                method: "POST",
                headers,
                body: JSON.stringify({
                  items,
                  password: password ?? undefined,
                  download_context: downloadContext,
                }),
                cache: "no-store",
              }
            );
            if (!res.ok) {
              const data = (await res.json().catch(() => ({}))) as {
                error?: string;
                message?: string;
              };
              const msg = data?.message ?? data?.error ?? "Failed to start download";
              const err = new Error(msg);
              (err as Error & { status?: number }).status = res.status;
              throw err;
            }
            const resBody = res.body;
            if (!resBody) throw new Error("No response body");

            const streamSaver = (await import("streamsaver")).default;
            const fileStream = streamSaver.createWriteStream("download.zip");
            await resBody.pipeTo(fileStream);
            onComplete?.();
            return;
          } catch (e) {
            lastErr = e;
            const is500 = e instanceof Error && (e as Error & { status?: number }).status === 500;
            if (attempt >= BULK_ZIP_RETRIES) break;
            if (!isNetworkError(e) && !is500) throw e;
            await new Promise((r) => setTimeout(r, BULK_ZIP_RETRY_DELAY_MS));
          }
        }

        // Fallback: individual downloads on network/500 errors (same as transfers)
        if (isNetworkError(lastErr!) || (lastErr instanceof Error && (lastErr as Error & { status?: number }).status === 500)) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const res = await fetch(
              `${baseUrl}/api/galleries/${galleryId}/download`,
              {
                method: "POST",
                headers,
                body: JSON.stringify({
                  object_key: item.object_key,
                  name: item.name,
                  password: password ?? undefined,
                  download_context: downloadContext,
                }),
              }
            );
            const json = (await res.json().catch(() => ({}))) as {
              url?: string;
              error?: string;
              message?: string;
            };
            if (!res.ok) throw new Error(json.message ?? json.error ?? "Download failed");
            const url = json.url;
            if (!url) continue;
            const fullUrl = url.startsWith("/") ? `${baseUrl}${url}` : url;
            const a = document.createElement("a");
            a.href = fullUrl;
            a.download = item.name;
            a.rel = "noopener noreferrer";
            a.click();
            if (i < items.length - 1) {
              await new Promise((r) => setTimeout(r, 300));
            }
          }
          onComplete?.();
          return;
        }
        throw lastErr;
      } catch (err) {
        const msg = isNotReadableError(err)
          ? "The download was interrupted. This can happen with large files or unstable connections. Try again or download fewer files at once."
          : isNetworkError(err)
            ? "Connection error—this can be intermittent. Please try again."
            : err instanceof Error
              ? err.message
              : "Download failed";
        setError(msg);
        console.error("[useGalleryBulkDownload]", err);
      } finally {
        setIsLoading(false);
      }
    },
    [galleryId, password, user, onComplete]
  );

  return { download, isLoading, error };
}
