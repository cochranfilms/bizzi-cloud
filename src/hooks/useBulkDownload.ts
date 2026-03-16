"use client";

import { useCallback, useState } from "react";
import JSZip from "jszip";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { RecentFile } from "@/hooks/useCloudFiles";

const DOWNLOAD_LIMIT = 50;
const FETCH_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

function isNotReadableError(err: unknown): boolean {
  if (err instanceof DOMException) return err.name === "NotReadableError";
  return err instanceof Error && err.name === "NotReadableError";
}

async function fetchWithRetry(url: string): Promise<Blob> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.blob();
    } catch (e) {
      lastErr = e;
      if (attempt < FETCH_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  throw lastErr;
}

/**
 * Deduplicates filenames within a zip (e.g. image.jpg, image (1).jpg, image (2).jpg).
 */
function uniqueZipNames(names: string[]): string[] {
  const used = new Map<string, number>();
  const result: string[] = [];
  for (const raw of names) {
    const base = raw.replace(/\.([^.]+)$/, "");
    const ext = raw.includes(".") ? raw.slice(raw.lastIndexOf(".")) : "";
    let name = raw;
    let n = 0;
    while (used.has(name)) {
      n++;
      name = `${base} (${n})${ext}`;
    }
    used.set(name, 1);
    result.push(name);
  }
  return result;
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

        const res = await fetch("/api/backup/download-bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ items }),
        });
        const data = (await res.json().catch(() => ({}))) as { urls?: { url: string; name: string }[]; error?: string };
        if (!res.ok) throw new Error(data?.error ?? "Failed to get download URLs");

        const urls = data.urls ?? [];
        if (urls.length === 0) throw new Error("No download URLs returned");

        // Single file: use direct download to avoid memory/stream issues with large files
        if (urls.length === 1) {
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

        const zip = new JSZip();
        const names = uniqueZipNames(urls.map((u) => u.name));

        for (let i = 0; i < urls.length; i++) {
          const { url } = urls[i];
          const name = names[i];
          const fetchUrl = url.startsWith("/") ? `${window.location.origin}${url}` : url;
          const blob = await fetchWithRetry(fetchUrl);
          zip.file(name, blob);
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(zipBlob);
        a.download = "download.zip";
        a.rel = "noopener noreferrer";
        a.click();
        URL.revokeObjectURL(a.href);
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
