"use client";

import { useEffect, useState } from "react";

function isLikelyPdfBlobType(mime: string): boolean {
  if (!mime) return false;
  if (mime === "application/pdf" || mime === "application/x-pdf") return true;
  return /\bpdf\b/i.test(mime);
}

/**
 * Fetches a PDF from a signed URL and returns a blob: URL for an iframe.
 * Cross-origin iframe navigation often triggers a file download when B2/CDN
 * serves attachment disposition or non-PDF content-types; embedding a blob
 * URL is same-origin and displays in the browser PDF viewer reliably.
 */
export function usePdfBlobUrl(
  sourceUrl: string | null,
  enabled: boolean
): { blobUrl: string | null; loading: boolean; failed: boolean } {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled || !sourceUrl) {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setLoading(false);
      setFailed(false);
      return;
    }

    let active = true;
    setLoading(true);
    setFailed(false);
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    void (async () => {
      try {
        const res = await fetch(sourceUrl);
        if (!active) return;
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const blob = await res.blob();
        if (!active) return;
        const b = isLikelyPdfBlobType(blob.type)
          ? blob
          : new Blob([blob], { type: "application/pdf" });
        const url = URL.createObjectURL(b);
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        setBlobUrl(url);
        setFailed(false);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [enabled, sourceUrl]);

  return { blobUrl, loading, failed };
}
