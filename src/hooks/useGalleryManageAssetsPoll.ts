"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { User } from "firebase/auth";
import { useUppyUpload } from "@/context/UppyUploadContext";

function assetsFingerprint(assets: { id: string; sort_order?: number; name?: string }[]) {
  return assets.map((a) => `${a.id}:${a.sort_order ?? 0}:${a.name ?? ""}`).join("\0");
}

type PollJson<A> =
  | { unchanged: true; assets_version: number; assets?: undefined }
  | { unchanged?: false; assets?: A[]; assets_version?: number };

/**
 * Polls manage list with If-None-Match (304) or parses unchanged JSON from ?sinceVersion= on server.
 * Reconciliation for canonical rows; pair with optimistic Uppy rows for same-tab instant UX.
 */
export function useGalleryManageAssetsPoll<A extends { id: string; name?: string; sort_order?: number }>(
  options: {
    galleryId: string | undefined;
    user: User | null;
    enabled: boolean;
    setAssets: Dispatch<SetStateAction<A[]>>;
  }
) {
  const { galleryId, user, enabled, setAssets } = options;
  const uppyCtx = useUppyUpload();
  const panelOpen = uppyCtx?.isUploadPanelOpen ?? false;
  const fpRef = useRef<string | null>(null);
  const etagRef = useRef<string | null>(null);

  useEffect(() => {
    fpRef.current = null;
    etagRef.current = null;
  }, [galleryId]);

  useEffect(() => {
    if (!galleryId || !user || !enabled) return;

    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const token = await user.getIdToken();
        const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
        if (etagRef.current) headers["If-None-Match"] = etagRef.current;

        const res = await fetch(`/api/galleries/${galleryId}/assets`, { headers });
        if (res.status === 304) return;
        if (res.status === 429) return;

        if (!res.ok) return;

        const data = (await res.json()) as PollJson<A>;
        if ("unchanged" in data && data.unchanged === true) return;

        const next = data.assets ?? [];
        const fp = assetsFingerprint(next);
        if (fp === fpRef.current) return;
        fpRef.current = fp;
        const etag = res.headers.get("ETag");
        if (etag?.trim()) etagRef.current = etag.trim();
        setAssets(next);
      } catch {
        /* transient offline / token errors */
      }
    };

    const intervalMs = panelOpen ? 2500 : 8000;
    const id = window.setInterval(tick, intervalMs);
    void tick();
    return () => clearInterval(id);
  }, [galleryId, user, enabled, panelOpen, setAssets]);
}
