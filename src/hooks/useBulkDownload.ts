"use client";

import { useCallback, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { RecentFile } from "@/hooks/useCloudFiles";
import { downloadMacosPackageZipStreaming } from "@/lib/macos-package-zip-download";

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

export interface UseBulkDownloadOptions {
  fetchFilesByIds: (ids: string[], limit?: number) => Promise<RecentFile[]>;
}

export function useBulkDownload({ fetchFilesByIds }: UseBulkDownloadOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadMacosPackageZip = useCallback(async (packageId: string) => {
    if (!packageId.startsWith("pkg_")) return;
    setIsLoading(true);
    setError(null);
    try {
      await downloadMacosPackageZipStreaming(packageId);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Package download failed";
      setError(msg);
      console.error("[useBulkDownload] package zip", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const download = useCallback(
    async (fileIds: string[]) => {
      if (fileIds.length === 0) return;
      if (fileIds.length > DOWNLOAD_LIMIT) {
        setError(`Download supports up to ${DOWNLOAD_LIMIT} files at once`);
        return;
      }

      setIsLoading(true);
      setError(null);
      let items: { object_key: string; name: string }[] = [];
      let token: string | null = null;
      try {
        token = (await getFirebaseAuth().currentUser?.getIdToken(true)) ?? null;
        if (!token) throw new Error("Not authenticated");

        const pkgPref = "macos-pkg:";
        const pkgIds = fileIds
          .filter((id) => id.startsWith(pkgPref))
          .map((id) => id.slice(pkgPref.length));
        const normalIds = fileIds.filter((id) => !id.startsWith(pkgPref));
        if (pkgIds.length > 0 && normalIds.length > 0) {
          throw new Error(
            "Download a macOS package by itself, or select regular files—don't mix both in one download."
          );
        }
        if (pkgIds.length > 1) {
          throw new Error("Download one macOS package at a time.");
        }
        if (pkgIds.length === 1) {
          setIsLoading(false);
          await downloadMacosPackageZip(pkgIds[0]);
          return;
        }

        const files = await fetchFilesByIds(normalIds, DOWNLOAD_LIMIT);
        items = files
          .filter((f) => f.objectKey)
          .map((f) => ({
            object_key: f.objectKey,
            // Preserve drive-relative paths so macOS packages (.fcpbundle, etc.) unzip with correct folders.
            name: f.path && String(f.path).length > 0 ? f.path : f.name,
          }));
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
        // Retry on network errors (ERR_QUIC_PROTOCOL_ERROR, etc.)—often intermittent
        let lastErr: unknown;
        for (let attempt = 1; attempt <= BULK_ZIP_RETRIES; attempt++) {
          try {
            const res = await fetch("/api/backup/download-bulk-zip", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ items }),
              cache: "no-store",
            });
            if (!res.ok) {
              const data = (await res.json().catch(() => ({}))) as { error?: string };
              throw new Error(data?.error ?? "Failed to start download");
            }
            const body = res.body;
            if (!body) throw new Error("No response body");

            const streamSaver = (await import("streamsaver")).default;
            const fileStream = streamSaver.createWriteStream("download.zip");
            await body.pipeTo(fileStream);
            return; // success
          } catch (e) {
            lastErr = e;
            if (attempt >= BULK_ZIP_RETRIES) break; // exhausted retries
            if (!isNetworkError(e)) throw e; // non-network: give up
            await new Promise((r) => setTimeout(r, BULK_ZIP_RETRY_DELAY_MS));
          }
        }

        // Fallback: streaming failed; download files individually via presigned URLs
        // (avoids ERR_QUIC_PROTOCOL_ERROR on long-lived streaming connections)
        if (isNetworkError(lastErr!)) {
          const bulkRes = await fetch("/api/backup/download-bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ items }),
          });
          const bulkData = (await bulkRes.json().catch(() => ({}))) as {
            urls?: { url: string; name: string }[];
            error?: string;
          };
          if (bulkRes.ok && bulkData.urls && bulkData.urls.length > 0) {
            for (const { url, name } of bulkData.urls) {
              const fullUrl = url.startsWith("/") ? `${window.location.origin}${url}` : url;
              const a = document.createElement("a");
              a.href = fullUrl;
              a.download = name;
              a.rel = "noopener noreferrer";
              a.target = "_blank";
              a.click();
              await new Promise((r) => setTimeout(r, 300)); // stagger to avoid browser throttling
            }
            return; // fallback succeeded
          }
        }
        throw lastErr;
      } catch (err) {
        // Fallback: when streaming fails with network error, try individual presigned downloads
        if (token && isNetworkError(err) && items.length > 1) {
          try {
            const fallbackRes = await fetch("/api/backup/download-bulk", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ items }),
            });
            const fallbackData = (await fallbackRes.json().catch(() => ({}))) as {
              urls?: { url: string; name: string }[];
              error?: string;
            };
            if (fallbackRes.ok && fallbackData.urls && fallbackData.urls.length > 0) {
              for (let i = 0; i < fallbackData.urls.length; i++) {
                const { url, name } = fallbackData.urls[i];
                const fullUrl = url.startsWith("/") ? `${window.location.origin}${url}` : url;
                const a = document.createElement("a");
                a.href = fullUrl;
                a.download = name;
                a.rel = "noopener noreferrer";
                a.target = "_blank";
                a.click();
                if (i < fallbackData.urls.length - 1) {
                  await new Promise((r) => setTimeout(r, 150));
                }
              }
              return; // success
            }
          } catch {
            /* ignore fallback failure */
          }
        }
        const msg = isNotReadableError(err)
          ? "The download was interrupted. This can happen with large files or unstable connections. Try again or download fewer files at once."
          : isNetworkError(err)
            ? "Connection error—this can be intermittent. Please try again."
            : err instanceof Error
              ? err.message
              : "Download failed";
        setError(msg);
        console.error("[useBulkDownload]", err);
      } finally {
        setIsLoading(false);
      }
    },
    [fetchFilesByIds, downloadMacosPackageZip]
  );

  return { download, downloadMacosPackageZip, isLoading, error };
}
