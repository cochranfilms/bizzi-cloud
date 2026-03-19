"use client";

import { useEffect, useRef, useState } from "react";
import { getAuthToken } from "@/lib/auth-token";

const PDF_EXT = /\.pdf$/i;

function isPdfFile(name: string): boolean {
  return PDF_EXT.test(name.toLowerCase());
}

/**
 * Returns a blob URL for the first page of a PDF as a thumbnail.
 * When enabled=false (e.g. when not in viewport), skips fetch.
 */
export function usePdfThumbnail(
  objectKey: string | undefined,
  fileName: string,
  options?: { enabled?: boolean }
): string | null {
  const { enabled = true } = options ?? {};
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!objectKey || !isPdfFile(fileName) || !enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken(false);
        if (!token || cancelled) return;
        const params = new URLSearchParams({
          object_key: objectKey,
          name: fileName,
        });
        const res = await fetch(`/api/backup/pdf-thumbnail?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        if (cancelled) return;
        const blobUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = blobUrl;
        setUrl(blobUrl);
      } catch {
        // Ignore - component will show fallback icon
      }
    })();
    return () => {
      cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setUrl(null);
    };
  }, [objectKey, fileName, enabled]);

  return url;
}
