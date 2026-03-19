"use client";

import { useCallback, useState } from "react";
import streamSaver from "streamsaver";

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

export interface UseTransferBulkDownloadOptions {
  slug: string;
  password?: string | null;
  onComplete?: () => void;
}

export function useTransferBulkDownload({
  slug,
  password,
  onComplete,
}: UseTransferBulkDownloadOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(
    async (items: { object_key: string; name: string }[]) => {
      if (items.length === 0) return;
      if (items.length > DOWNLOAD_LIMIT) {
        setError(`Download supports up to ${DOWNLOAD_LIMIT} files at once`);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const baseUrl =
          typeof window !== "undefined" ? window.location.origin : "";
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (items.length === 1) {
          const [item] = items;
          const res = await fetch(
            `${baseUrl}/api/transfers/${encodeURIComponent(slug)}/download`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                object_key: item.object_key,
                name: item.name,
                password: password ?? undefined,
              }),
            }
          );
          const json = (await res.json().catch(() => ({}))) as {
            url?: string;
            error?: string;
          };
          if (!res.ok) {
            throw new Error(json?.error ?? "Download failed");
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

        let lastErr: unknown;
        for (let attempt = 1; attempt <= BULK_ZIP_RETRIES; attempt++) {
          try {
            const res = await fetch(
              `${baseUrl}/api/transfers/${encodeURIComponent(slug)}/download-bulk-zip`,
              {
                method: "POST",
                headers,
                body: JSON.stringify({
                  items,
                  password: password ?? undefined,
                }),
                cache: "no-store",
              }
            );
            if (!res.ok) {
              const data = (await res.json().catch(() => ({}))) as {
                error?: string;
              };
              throw new Error(
                data?.error ?? "Failed to start download"
              );
            }
            const body = res.body;
            if (!body) throw new Error("No response body");

            const fileStream = streamSaver.createWriteStream("download.zip");
            await body.pipeTo(fileStream);
            onComplete?.();
            return;
          } catch (e) {
            lastErr = e;
            if (attempt >= BULK_ZIP_RETRIES) break;
            if (!isNetworkError(e)) throw e;
            await new Promise((r) => setTimeout(r, BULK_ZIP_RETRY_DELAY_MS));
          }
        }

        if (isNetworkError(lastErr!)) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const res = await fetch(
              `${baseUrl}/api/transfers/${encodeURIComponent(slug)}/download`,
              {
                method: "POST",
                headers,
                body: JSON.stringify({
                  object_key: item.object_key,
                  name: item.name,
                  password: password ?? undefined,
                }),
              }
            );
            const json = (await res.json().catch(() => ({}))) as {
              url?: string;
              error?: string;
            };
            if (!res.ok)
              throw new Error(json?.error ?? "Download failed");
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
        console.error("[useTransferBulkDownload]", err);
      } finally {
        setIsLoading(false);
      }
    },
    [slug, password, onComplete]
  );

  return { download, isLoading, error };
}
