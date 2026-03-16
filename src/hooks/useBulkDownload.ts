"use client";

import { useCallback, useState } from "react";
import streamSaver from "streamsaver";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { RecentFile } from "@/hooks/useCloudFiles";

const DOWNLOAD_LIMIT = 50;

function isNotReadableError(err: unknown): boolean {
  if (err instanceof DOMException) return err.name === "NotReadableError";
  return err instanceof Error && err.name === "NotReadableError";
}

export interface UseBulkDownloadOptions {
  fetchFilesByIds: (ids: string[], limit?: number) => Promise<RecentFile[]>;
}

export function useBulkDownload({ fetchFilesByIds }: UseBulkDownloadOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(
    async (fileIds: string[]) => {
      if (fileIds.length === 0) return;
      if (fileIds.length > DOWNLOAD_LIMIT) {
        setError(`Download supports up to ${DOWNLOAD_LIMIT} files at once`);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const token = await getFirebaseAuth().currentUser?.getIdToken(true);
        if (!token) throw new Error("Not authenticated");

        const files = await fetchFilesByIds(fileIds, DOWNLOAD_LIMIT);
        const items = files.filter((f) => f.objectKey).map((f) => ({ object_key: f.objectKey, name: f.name }));
        if (items.length === 0) {
          throw new Error("No downloadable files found");
        }

        // Single file: use direct presigned download (B2→browser, no server proxy)
        if (items.length === 1) {
          const res = await fetch("/api/backup/download-bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ items }),
          });
          const data = (await res.json().catch(() => ({}))) as { urls?: { url: string; name: string }[]; error?: string };
          if (!res.ok) throw new Error(data?.error ?? "Failed to get download URLs");
          const urls = data.urls ?? [];
          if (urls.length === 0) throw new Error("No download URLs returned");
          const { url, name } = urls[0];
          const fullUrl = url.startsWith("/") ? `${window.location.origin}${url}` : url;
          const a = document.createElement("a");
          a.href = fullUrl;
          a.download = name;
          a.rel = "noopener noreferrer";
          a.target = "_blank";
          a.click();
          return;
        }

        // Multi-file: server streams ZIP (avoids loading 10–20GB into browser memory)
        const res = await fetch("/api/backup/download-bulk-zip", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ items }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data?.error ?? "Failed to start download");
        }
        const body = res.body;
        if (!body) throw new Error("No response body");

        const fileStream = streamSaver.createWriteStream("download.zip");
        await body.pipeTo(fileStream);
      } catch (err) {
        const msg = isNotReadableError(err)
          ? "The download was interrupted. This can happen with large files or unstable connections. Try again or download fewer files at once."
          : err instanceof Error
            ? err.message
            : "Download failed";
        setError(msg);
        console.error("[useBulkDownload]", err);
      } finally {
        setIsLoading(false);
      }
    },
    [fetchFilesByIds]
  );

  return { download, isLoading, error };
}
