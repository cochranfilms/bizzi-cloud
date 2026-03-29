"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Loader2 } from "lucide-react";

export type ProofingModalAsset = {
  id: string;
  name: string;
  object_key?: string;
};

export type ProofingModalComment = {
  id: string;
  body: string;
  client_name?: string | null;
  client_email?: string | null;
  created_at: string | null;
};

type Props = {
  galleryId: string;
  asset: ProofingModalAsset | null;
  comments: ProofingModalComment[];
  onClose: () => void;
  getAuthToken: () => Promise<string | null>;
};

/**
 * Creator/manager-only clip review: stream + read-only comment thread (no public-client assumptions).
 */
export function ProofingClipReviewModal({
  galleryId,
  asset,
  comments,
  onClose,
  getAuthToken,
}: Props) {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStream = useCallback(async () => {
    if (!asset?.object_key) return;
    setLoading(true);
    setStreamUrl(null);
    try {
      const params = new URLSearchParams({
        object_key: asset.object_key,
        name: asset.name,
      });
      const headers: Record<string, string> = {};
      const t = await getAuthToken();
      if (t) headers.Authorization = `Bearer ${t}`;
      const res = await fetch(
        `/api/galleries/${galleryId}/video-stream-url?${params}`,
        { headers }
      );
      if (!res.ok) return;
      const json = (await res.json()) as { streamUrl?: string };
      if (json.streamUrl) {
        const u = json.streamUrl;
        setStreamUrl(u.startsWith("/") ? `${window.location.origin}${u}` : u);
      }
    } finally {
      setLoading(false);
    }
  }, [galleryId, asset?.object_key, asset?.name, getAuthToken]);

  useEffect(() => {
    if (!asset) {
      setStreamUrl(null);
      return;
    }
    void loadStream();
  }, [asset, loadStream]);

  useEffect(() => {
    if (!asset) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asset, onClose]);

  if (!asset) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="proofing-clip-review-title"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-neutral-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2
            id="proofing-clip-review-title"
            className="truncate pr-4 text-sm font-medium text-white"
          >
            {asset.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/80 hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="relative aspect-video w-full shrink-0 bg-black md:w-[60%]">
            {loading ? (
              <div className="flex h-full items-center justify-center text-white/60">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : streamUrl ? (
              <video
                src={streamUrl}
                controls
                className="h-full w-full object-contain"
                playsInline
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-white/50">
                Preview unavailable
              </div>
            )}
          </div>
          <div className="flex min-h-[120px] flex-1 flex-col overflow-y-auto border-t border-white/10 md:border-l md:border-t-0">
            <p className="border-b border-white/10 px-3 py-2 text-xs font-medium uppercase tracking-wide text-white/50">
              Comments on this clip
            </p>
            <div className="space-y-2 p-3">
              {comments.length === 0 ? (
                <p className="text-sm text-white/50">No comments yet.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="rounded-lg bg-white/5 px-3 py-2 text-sm text-white/90">
                    <p className="text-xs text-white/45">
                      {c.client_name || c.client_email || "Client"}
                      {c.created_at
                        ? ` · ${new Date(c.created_at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}`
                        : ""}
                    </p>
                    <p className="mt-1">{c.body}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
