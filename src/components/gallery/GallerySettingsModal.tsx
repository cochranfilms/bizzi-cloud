"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { Globe, Image as ImageIcon, Loader2, Check, ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

function ShareImageThumbnail({
  galleryId,
  asset,
  selected,
  onSelect,
}: {
  galleryId: string;
  asset: { id: string; name: string; object_key: string };
  selected: boolean;
  onSelect: () => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const thumbRef = useRef<string | null>(null);

  useEffect(() => {
    if (!galleryId || !asset.object_key || !asset.name) return;
    let cancelled = false;
    (async () => {
      try {
        const auth = (await import("@/lib/firebase/client")).getFirebaseAuth();
        const token = await auth.currentUser?.getIdToken(true);
        if (!token || cancelled) return;
        const params = new URLSearchParams({
          object_key: asset.object_key,
          name: asset.name,
          size: "thumb",
        });
        const res = await fetch(`/api/galleries/${galleryId}/thumbnail?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (thumbRef.current) URL.revokeObjectURL(thumbRef.current);
        thumbRef.current = url;
        setThumbUrl(url);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      if (thumbRef.current) {
        URL.revokeObjectURL(thumbRef.current);
        thumbRef.current = null;
      }
      setThumbUrl(null);
    };
  }, [galleryId, asset.object_key, asset.name]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
        selected
          ? "border-bizzi-blue ring-2 ring-bizzi-blue/30"
          : "border-transparent hover:border-neutral-300 dark:hover:border-neutral-600"
      }`}
    >
      {thumbUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-neutral-100 dark:bg-neutral-800">
          <ImageIcon className="h-6 w-6 text-neutral-400" />
        </div>
      )}
      {selected && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Check className="h-6 w-6 text-white drop-shadow" strokeWidth={3} />
        </div>
      )}
    </button>
  );
}

export interface GallerySettingsModalProps {
  open: boolean;
  onClose: () => void;
  /** Use enterprise primary color for styling when true */
  isEnterprise?: boolean;
}

export default function GallerySettingsModal({
  open,
  onClose,
  isEnterprise = false,
}: GallerySettingsModalProps) {
  const { user } = useAuth();

  const [publicSlug, setPublicSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [shareImage, setShareImage] = useState<{
    object_key: string;
    name: string;
    gallery_id: string;
  } | null>(null);
  const [shareImageCandidates, setShareImageCandidates] = useState<
    Array<{ id: string; gallery_id: string; gallery_title: string; name: string; object_key: string }>
  >([]);
  const [shareImageLoading, setShareImageLoading] = useState(false);

  useEffect(() => {
    if (!user || !open) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/profile", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setPublicSlug(data.public_slug ?? data.handle ?? "");
          if (data.share_image_object_key && data.share_image_name && data.share_image_gallery_id) {
            setShareImage({
              object_key: data.share_image_object_key,
              name: data.share_image_name,
              gallery_id: data.share_image_gallery_id,
            });
          } else {
            setShareImage(null);
          }
        }
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, open]);

  useEffect(() => {
    if (!user || !open) return;
    let cancelled = false;
    setShareImageLoading(true);
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/profile/share-image-candidates", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) setShareImageCandidates(data.assets ?? []);
      } finally {
        if (!cancelled) setShareImageLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, open]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const token = await user.getIdToken();
      const body: Record<string, unknown> = {
        public_slug: publicSlug.trim() || null,
      };
      if (shareImage) {
        body.share_image_object_key = shareImage.object_key;
        body.share_image_name = shareImage.name;
        body.share_image_gallery_id = shareImage.gallery_id;
      } else {
        body.share_image_object_key = null;
        body.share_image_name = null;
        body.share_image_gallery_id = null;
      }
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const normalizedHandle = publicSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const homepageUrl = normalizedHandle ? `${baseUrl}/p/${normalizedHandle}` : null;
  const brandedExample = normalizedHandle ? `${baseUrl}/${normalizedHandle}/my-gallery-name` : null;

  const accentClass = isEnterprise ? "text-[var(--enterprise-primary)]" : "text-bizzi-blue";

  return (
    <Modal open={open} onClose={onClose} title="Gallery settings" maxWidth="lg">
      <div className="max-h-[70vh] overflow-y-auto">
        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <h3 className={`mb-2 flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-white ${accentClass}`}>
              <Globe className="h-4 w-4" />
              Profile handle
            </h3>
            <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
              Set your custom handle for branded URLs. Share galleries at{" "}
              <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">bizzicloud.io/yourhandle/gallery-name</code>.
              Same handle across personal and enterprise when using the same email.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Handle
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-500 dark:text-neutral-400">
                  {baseUrl}/
                </span>
                <input
                  type="text"
                  value={publicSlug}
                  onChange={(e) => {
                    setPublicSlug(e.target.value.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase());
                    setError(null);
                  }}
                  placeholder="janesmith"
                  disabled={loadingProfile}
                  className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder-neutral-500"
                />
              </div>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                3–40 characters, letters, numbers, and hyphens only
              </p>
            </div>
          </div>

          <div className="border-t border-neutral-200 pt-6 dark:border-neutral-700">
            <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-white">
              <ImageIcon className={`h-4 w-4 ${accentClass}`} />
              Link preview image
            </h3>
            <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
              Choose the image that appears when you share your public gallery link (
              <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
                {baseUrl}/p/{normalizedHandle || "yourhandle"}
              </code>
              ) on social media, messaging apps, or anywhere else.
            </p>
            {shareImageLoading ? (
              <div className="flex gap-2 py-4 text-neutral-500 dark:text-neutral-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading your photos…
              </div>
            ) : shareImageCandidates.length === 0 ? (
              <p className="py-4 text-sm text-neutral-500 dark:text-neutral-400">
                Create galleries and add photos to choose a link preview image.
              </p>
            ) : (
              <div>
                <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Select photo
                </label>
                <div className="grid max-h-40 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
                  {shareImageCandidates.map((asset) => (
                    <ShareImageThumbnail
                      key={`${asset.gallery_id}-${asset.id}`}
                      galleryId={asset.gallery_id}
                      asset={asset}
                      selected={
                        shareImage?.object_key === asset.object_key &&
                        shareImage?.gallery_id === asset.gallery_id
                      }
                      onSelect={() =>
                        setShareImage({
                          object_key: asset.object_key,
                          name: asset.name,
                          gallery_id: asset.gallery_id,
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {success && (
            <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <Check className="h-4 w-4" /> Saved
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={loading || loadingProfile}
              className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-70"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </button>
            {homepageUrl && (
              <a
                href={homepageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium dark:border-neutral-700 dark:text-neutral-300"
              >
                <ExternalLink className="h-4 w-4" />
                View homepage
              </a>
            )}
          </div>
          {brandedExample && (
            <p className="flex w-full items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
              Example gallery URL: <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">{brandedExample}</code>
            </p>
          )}
        </form>
      </div>
    </Modal>
  );
}
