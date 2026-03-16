"use client";

import Image from "next/image";
import { useState, useEffect, useCallback, useRef } from "react";
import { Save, Check, Loader2, Image as ImageIcon, CreditCard, Film } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { GALLERY_IMAGE_EXT, GALLERY_VIDEO_EXT } from "@/lib/gallery-file-types";
import { GALLERY_BACKGROUND_THEMES } from "@/lib/gallery-background-themes";
import { HERO_HEIGHT_PRESETS } from "@/lib/cover-constants";
import { useGalleryThumbnail } from "@/hooks/useGalleryThumbnail";
import CoverFocalPointEditor from "@/components/gallery/CoverFocalPointEditor";

function CoverFocalPointEditorSection({
  galleryId,
  asset,
  focalX,
  focalY,
  onChange,
  bannerSize,
}: {
  galleryId: string;
  asset: { id: string; name: string; object_key: string } | null;
  focalX: number;
  focalY: number;
  onChange: (x: number, y: number) => void;
  bannerSize?: "small" | "medium" | "large" | "cinematic";
}) {
  const imageUrl = useGalleryThumbnail(
    galleryId,
    asset?.object_key,
    asset?.name ?? "",
    { enabled: !!asset, size: "cover-md" }
  );
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Edit crop
      </label>
      <CoverFocalPointEditor
        imageUrl={imageUrl}
        focalX={focalX}
        focalY={focalY}
        onChange={onChange}
        bannerSize={bannerSize ?? "medium"}
      />
    </div>
  );
}

function CoverAssetThumbnail({
  galleryId,
  asset,
  selected,
  onSelect,
}: {
  galleryId: string;
  asset: { id: string; name: string; object_key: string; media_type: string };
  selected: boolean;
  onSelect: () => void;
}) {
  const thumbUrl = useGalleryThumbnail(galleryId, asset.object_key, asset.name, {
    enabled: true,
    size: "thumb",
  });

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
        /* eslint-disable-next-line @next/next/no-img-element -- Blob URL from gallery thumbnail API */
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

interface GallerySettingsFormProps {
  galleryId: string;
  onRefetch?: () => void | Promise<void>;
  initialData: {
    version?: number;
    title?: string;
    cover_asset_id?: string | null;
    share_image_asset_id?: string | null;
    cover_position?: string | null;
    cover_focal_x?: number | null;
    cover_focal_y?: number | null;
    cover_alt_text?: string | null;
    cover_overlay_opacity?: number | null;
    cover_title_alignment?: "left" | "center" | "right" | null;
    cover_hero_height?: "small" | "medium" | "large" | "cinematic" | null;
    description?: string | null;
    event_date?: string | null;
    expiration_date?: string | null;
    access_mode?: string;
    invited_emails?: string[];
    layout?: string;
    branding?: Record<string, unknown>;
    download_settings?: Record<string, unknown>;
    watermark?: Record<string, unknown>;
    lut?: { enabled?: boolean; storage_url?: string | null } | null;
    /** Video gallery invoice settings */
    invoice_url?: string | null;
    invoice_label?: string | null;
    invoice_status?: string | null;
    invoice_required_for_download?: boolean;
    /** Video gallery */
    gallery_type?: "photo" | "video";
    featured_video_asset_id?: string | null;
  };
}

export default function GallerySettingsForm({
  galleryId,
  initialData,
  onRefetch,
}: GallerySettingsFormProps) {
  const { user } = useAuth();
  const versionRef = useRef<number>(initialData.version ?? 1);
  useEffect(() => {
    versionRef.current = initialData.version ?? 1;
  }, [initialData.version]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initialData.title ?? "");
  const [description, setDescription] = useState(initialData.description ?? "");
  const [eventDate, setEventDate] = useState(initialData.event_date ?? "");
  const [expirationDate, setExpirationDate] = useState(initialData.expiration_date ?? "");
  const [accessMode, setAccessMode] = useState(
    initialData.access_mode === "pin" ? "public" : (initialData.access_mode ?? "public")
  );
  const [invitedEmails, setInvitedEmails] = useState(
    (initialData.invited_emails ?? []).join(", ")
  );
  const [layout, setLayout] = useState(initialData.layout ?? "masonry");
  const [coverAssetId, setCoverAssetId] = useState<string | null>(
    initialData.cover_asset_id ?? null
  );
  const [featuredVideoAssetId, setFeaturedVideoAssetId] = useState<string | null>(
    initialData.featured_video_asset_id ?? null
  );
  const [shareImageAssetId, setShareImageAssetId] = useState<string | null>(
    initialData.share_image_asset_id ?? null
  );
  const [coverFocalX, setCoverFocalX] = useState<number>(
    typeof initialData.cover_focal_x === "number"
      ? initialData.cover_focal_x
      : 50
  );
  const [coverFocalY, setCoverFocalY] = useState<number>(
    typeof initialData.cover_focal_y === "number"
      ? initialData.cover_focal_y
      : 50
  );
  const [coverAltText, setCoverAltText] = useState(
    initialData.cover_alt_text ?? ""
  );
  const [coverOverlayOpacity, setCoverOverlayOpacity] = useState<number>(
    typeof initialData.cover_overlay_opacity === "number"
      ? initialData.cover_overlay_opacity
      : 50
  );
  const [coverTitleAlignment, setCoverTitleAlignment] = useState<
    "left" | "center" | "right"
  >(
    (initialData.cover_title_alignment as "left" | "center" | "right") ?? "center"
  );
  const [coverHeroHeight, setCoverHeroHeight] = useState<
    "small" | "medium" | "large" | "cinematic"
  >(
    (initialData.cover_hero_height as "small" | "medium" | "large" | "cinematic") ??
      "medium"
  );
  const [password, setPassword] = useState("");

  const [businessName, setBusinessName] = useState(
    (initialData.branding?.business_name as string) ?? ""
  );
  const [backgroundTheme, setBackgroundTheme] = useState(
    (initialData.branding?.background_theme as string) ?? "warm-beige"
  );
  const [accentColor, setAccentColor] = useState(
    (initialData.branding?.accent_color as string) ?? "#00BFFF"
  );
  const [welcomeMessage, setWelcomeMessage] = useState(
    (initialData.branding?.welcome_message as string) ?? ""
  );
  const [prePageMusicUrl, setPrePageMusicUrl] = useState(
    (initialData.branding?.pre_page_music_url as string) ?? ""
  );
  const [prePageInstructions, setPrePageInstructions] = useState(
    (initialData.branding?.pre_page_instructions as string) ?? ""
  );
  const [contactEmail, setContactEmail] = useState(
    (initialData.branding?.contact_email as string) ?? ""
  );
  const [websiteUrl, setWebsiteUrl] = useState(
    (initialData.branding?.website_url as string) ?? ""
  );

  const [watermarkEnabled, setWatermarkEnabled] = useState(
    (initialData.watermark?.enabled as boolean) ?? false
  );
  const [watermarkPosition, setWatermarkPosition] = useState(
    (initialData.watermark?.position as string) ?? "bottom-right"
  );
  const [watermarkOpacity, setWatermarkOpacity] = useState(
    (initialData.watermark?.opacity as number) ?? 50
  );
  const [watermarkImageUrl, setWatermarkImageUrl] = useState<string | null>(
    (initialData.watermark?.image_url as string) ?? null
  );
  const [watermarkFile, setWatermarkFile] = useState<File | null>(null);
  const [watermarkPreviewUrl, setWatermarkPreviewUrl] = useState<string | null>(null);
  const [uploadingWatermark, setUploadingWatermark] = useState(false);
  const [watermarkError, setWatermarkError] = useState<string | null>(null);
  const watermarkInputRef = useRef<HTMLInputElement>(null);

  const [lutEnabled, setLutEnabled] = useState(
    (initialData.lut?.enabled as boolean) ?? false
  );
  const [lutStorageUrl, setLutStorageUrl] = useState<string | null>(
    (initialData.lut?.storage_url as string) ?? null
  );
  const [lutFile, setLutFile] = useState<File | null>(null);
  const [uploadingLut, setUploadingLut] = useState(false);
  const [lutError, setLutError] = useState<string | null>(null);
  const lutInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!watermarkFile) {
      setWatermarkPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(watermarkFile);
    setWatermarkPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [watermarkFile]);

  const [allowFullGalleryDownload, setAllowFullGalleryDownload] = useState(
    (initialData.download_settings?.allow_full_gallery_download as boolean) ?? true
  );
  const [allowSingleDownload, setAllowSingleDownload] = useState(
    (initialData.download_settings?.allow_single_download as boolean) ?? true
  );
  const [allowSelectedDownload, setAllowSelectedDownload] = useState(
    (initialData.download_settings?.allow_selected_download as boolean) ?? true
  );
  const [freeDownloadLimit, setFreeDownloadLimit] = useState(
    String((initialData.download_settings?.free_download_limit as number) ?? "")
  );

  const [invoiceUrl, setInvoiceUrl] = useState(
    (initialData.invoice_url as string) ?? ""
  );
  const [invoiceLabel, setInvoiceLabel] = useState(
    (initialData.invoice_label as string) ?? "Pay Invoice"
  );
  const [invoiceStatus, setInvoiceStatus] = useState<string>(
    (initialData.invoice_status as string) ?? "none"
  );
  const [invoiceRequiredForDownload, setInvoiceRequiredForDownload] = useState(
    (initialData.invoice_required_for_download as boolean) ?? false
  );
  const [markingPaid, setMarkingPaid] = useState(false);

  const handleMarkAsPaid = useCallback(async () => {
    if (!user) return;
    const nextStatus = invoiceStatus === "paid" ? "sent" : "paid";
    setMarkingPaid(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/galleries/${galleryId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          version: versionRef.current,
          invoice_status: nextStatus,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        if (res.status === 409) {
          onRefetch?.();
        }
        throw new Error(data.error ?? "Failed to update");
      }
      setInvoiceStatus(nextStatus);
      versionRef.current += 1;
      onRefetch?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setMarkingPaid(false);
    }
  }, [user, galleryId, invoiceStatus, onRefetch]);

  const isVideoGallery = initialData.gallery_type === "video";

  const [coverAssets, setCoverAssets] = useState<
    { id: string; name: string; object_key: string; media_type: string }[]
  >([]);
  const [videoAssets, setVideoAssets] = useState<
    { id: string; name: string; object_key: string; media_type: string }[]
  >([]);
  const [coverAssetsLoading, setCoverAssetsLoading] = useState(false);
  const [videoAssetsLoading, setVideoAssetsLoading] = useState(false);

  const fetchCoverAssets = useCallback(async () => {
    if (!user || !galleryId) return;
    setCoverAssetsLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/galleries/${galleryId}/view`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const assets = (data.assets ?? []).filter(
        (a: { media_type: string; name: string }) =>
          a.media_type === "image" || GALLERY_IMAGE_EXT.test(a.name ?? "")
      );
      setCoverAssets(assets);
    } finally {
      setCoverAssetsLoading(false);
    }
  }, [user, galleryId]);

  const fetchVideoAssets = useCallback(async () => {
    if (!user || !galleryId) return;
    setVideoAssetsLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/galleries/${galleryId}/view`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const assets = (data.assets ?? []).filter(
        (a: { media_type: string; name: string }) =>
          a.media_type === "video" || GALLERY_VIDEO_EXT.test(a.name ?? "")
      );
      setVideoAssets(assets);
    } finally {
      setVideoAssetsLoading(false);
    }
  }, [user, galleryId]);

  useEffect(() => {
    fetchCoverAssets();
  }, [fetchCoverAssets]);

  useEffect(() => {
    if (isVideoGallery) fetchVideoAssets();
  }, [isVideoGallery, fetchVideoAssets]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const version = versionRef.current;
      const body: Record<string, unknown> = {
        version,
        title: title.trim(),
        cover_asset_id: coverAssetId || null,
        share_image_asset_id: shareImageAssetId || null,
        cover_focal_x: coverFocalX,
        cover_focal_y: coverFocalY,
        cover_alt_text: coverAltText.trim() || null,
        cover_overlay_opacity: coverOverlayOpacity,
        cover_title_alignment: coverTitleAlignment,
        cover_hero_height: coverHeroHeight,
        description: description.trim() || null,
        event_date: eventDate || null,
        expiration_date: expirationDate || null,
        access_mode: accessMode,
        invited_emails: invitedEmails
          .split(/[\s,]+/)
          .map((e) => e.trim())
          .filter(Boolean),
        layout,
        branding: {
          business_name: businessName.trim() || null,
          background_theme: backgroundTheme || null,
          accent_color: accentColor || null,
          welcome_message: welcomeMessage.trim() || null,
          pre_page_music_url: prePageMusicUrl.trim() || null,
          pre_page_instructions: prePageInstructions.trim() || null,
          contact_email: contactEmail.trim() || null,
          website_url: websiteUrl.trim() || null,
        },
        download_settings: {
          allow_full_gallery_download: allowFullGalleryDownload,
          allow_single_download: allowSingleDownload,
          allow_selected_download: allowSelectedDownload,
          free_download_limit:
            freeDownloadLimit === "" ? null : Number(freeDownloadLimit),
        },
        watermark: {
          enabled: watermarkEnabled,
          position: watermarkPosition,
          opacity: watermarkOpacity,
          image_url: watermarkImageUrl ?? undefined,
        },
        lut: {
          enabled: lutEnabled,
          storage_url: lutStorageUrl ?? undefined,
        },
        invoice_url: invoiceUrl.trim() || null,
        invoice_label: invoiceLabel.trim() || null,
        invoice_status: invoiceStatus || null,
        invoice_required_for_download: invoiceRequiredForDownload,
      };
      if (accessMode === "password" && password) body.password = password;

      const res = await fetch(`/api/galleries/${galleryId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        if (res.status === 409) {
          onRefetch?.();
          throw new Error(
            data.error ?? "Gallery was modified by another user. Refreshed. Please try again."
          );
        }
        throw new Error(data.error ?? "Failed to save");
      }
      setSaved(true);
      setPassword("");
      versionRef.current += 1;
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      className="space-y-8"
    >
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Cover photo */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
          Cover photo
        </h2>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          Choose which photo appears as the banner on your gallery. Recommended: <strong>2500 × 1400 px</strong> for best results. Keep key subjects centered for mobile.
        </p>
        {coverAssetsLoading ? (
          <div className="flex items-center gap-2 py-8 text-neutral-500 dark:text-neutral-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading photos…
          </div>
        ) : coverAssets.length === 0 ? (
          <p className="py-4 text-sm text-neutral-500 dark:text-neutral-400">
            Add images to your gallery to choose a cover photo.
          </p>
        ) : (
          <div className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Select photo
              </label>
              <div className="grid max-h-48 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
                {coverAssets.map((asset) => (
                  <CoverAssetThumbnail
                    key={asset.id}
                    galleryId={galleryId}
                    asset={asset}
                    selected={coverAssetId === asset.id}
                    onSelect={() => setCoverAssetId(asset.id)}
                  />
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Overlay darkness
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={coverOverlayOpacity}
                  onChange={(e) => setCoverOverlayOpacity(Number(e.target.value))}
                  className="w-full"
                />
                <p className="mt-1 text-xs text-neutral-500">{coverOverlayOpacity}%</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Banner Size
                </label>
                <select
                  value={coverHeroHeight}
                  onChange={(e) =>
                    setCoverHeroHeight(e.target.value as keyof typeof HERO_HEIGHT_PRESETS)
                  }
                  className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                  <option value="cinematic">Cinematic</option>
                </select>
              </div>
            </div>
            {coverAssetId && (
              <CoverFocalPointEditorSection
                galleryId={galleryId}
                asset={coverAssets.find((a) => a.id === coverAssetId) ?? null}
                focalX={coverFocalX}
                focalY={coverFocalY}
                onChange={(x, y) => {
                  setCoverFocalX(x);
                  setCoverFocalY(y);
                }}
                bannerSize={coverHeroHeight}
              />
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Cover alt text
              </label>
              <input
                type="text"
                value={coverAltText}
                onChange={(e) => setCoverAltText(e.target.value)}
                placeholder="Describe the cover for accessibility"
                className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Title alignment on cover
              </label>
              <select
                value={coverTitleAlignment}
                onChange={(e) =>
                  setCoverTitleAlignment(e.target.value as "left" | "center" | "right")
                }
                className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>
        )}
      </section>

      {/* Link preview image */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
          Link preview image
        </h2>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          Choose the image that appears when you share this gallery&apos;s link on social media, messaging apps, or anywhere else. This is the preview people see before they click.
        </p>
        {coverAssetsLoading ? (
          <div className="flex gap-2 py-4 text-neutral-500 dark:text-neutral-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading photos…
          </div>
        ) : coverAssets.length === 0 ? (
          <p className="py-4 text-sm text-neutral-500 dark:text-neutral-400">
            Add images to your gallery to choose a link preview image.
          </p>
        ) : (
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Select photo
            </label>
            <div className="grid max-h-48 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
              {coverAssets.map((asset) => (
                <CoverAssetThumbnail
                  key={asset.id}
                  galleryId={galleryId}
                  asset={asset}
                  selected={shareImageAssetId === asset.id}
                  onSelect={() => setShareImageAssetId(asset.id)}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Basic */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
          Basic info
        </h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Gallery title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Event date
              </label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Expiration date
              </label>
              <input
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Layout
            </label>
            <select
              value={layout}
              onChange={(e) => setLayout(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            >
              <option value="masonry">Masonry</option>
              <option value="justified">Justified</option>
              <option value="cinematic">Cinematic</option>
            </select>
          </div>
        </div>
      </section>

      {/* Access */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
          Access
        </h2>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Access mode
            </label>
            <select
              value={accessMode}
              onChange={(e) => setAccessMode(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            >
              <option value="public">Public (anyone with link)</option>
              <option value="password">Password required</option>
              <option value="invite_only">Invite only</option>
            </select>
          </div>
          {accessMode === "password" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                New password (leave blank to keep current)
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
          )}
          {accessMode === "invite_only" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Invited emails (comma separated)
              </label>
              <input
                type="text"
                value={invitedEmails}
                onChange={(e) => setInvitedEmails(e.target.value)}
                placeholder="client@example.com, other@example.com"
                className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
          )}
        </div>
      </section>

      {/* Branding */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
          Branding
        </h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Business name
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Your Studio Name"
              className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Gallery background
            </label>
            <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
              Choose a background color for your client gallery view.
            </p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {GALLERY_BACKGROUND_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setBackgroundTheme(theme.id)}
                  className={`flex flex-col items-center gap-1 rounded-lg border-2 p-2 transition-colors ${
                    backgroundTheme === theme.id
                      ? "border-bizzi-blue ring-2 ring-bizzi-blue/20"
                      : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
                  }`}
                  title={theme.name}
                >
                  <div
                    className="h-8 w-8 rounded-full border border-neutral-200 dark:border-neutral-600"
                    style={{ backgroundColor: theme.background }}
                  />
                  <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    {theme.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Accent color
            </label>
            <div className="flex gap-2">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border border-neutral-200 dark:border-neutral-700"
              />
              <input
                type="text"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="flex-1 rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Welcome message
            </label>
            <textarea
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              rows={2}
              placeholder="A personal message for your clients..."
              className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Shown on the gallery cover page before clients enter.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Pre-page music (optional)
            </label>
            <input
              type="url"
              value={prePageMusicUrl}
              onChange={(e) => setPrePageMusicUrl(e.target.value)}
              placeholder="https://... (MP3, WAV, etc.)"
              className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Background music URL for the cover page. Clients can toggle on/off.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Pre-page instructions (optional)
            </label>
            <input
              type="text"
              value={prePageInstructions}
              onChange={(e) => setPrePageInstructions(e.target.value)}
              placeholder="e.g. Favorite images you love, download with the button, or contact us for prints."
              className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Short note shown on the cover page about favoriting, downloading, or purchasing.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Contact email
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="hello@studio.com"
                className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Website URL
              </label>
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Invoice (video galleries) */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
          Invoice & payment
        </h2>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          Add a payment link so clients can pay their invoice. Once they&apos;ve paid, mark it as paid below to unlock downloads.
        </p>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Invoice or payment URL
            </label>
            <input
              type="url"
              value={invoiceUrl}
              onChange={(e) => setInvoiceUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Button label (what clients see)
            </label>
            <input
              type="text"
              value={invoiceLabel}
              onChange={(e) => setInvoiceLabel(e.target.value)}
              placeholder="Pay Invoice"
              className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={invoiceRequiredForDownload}
              onChange={(e) => setInvoiceRequiredForDownload(e.target.checked)}
              className="rounded border-neutral-300 text-bizzi-blue focus:ring-bizzi-blue"
            />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Block downloads until invoice is paid
            </span>
          </label>
          {invoiceUrl && (
            <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800/50">
              <CreditCard className="h-5 w-5 text-neutral-500" />
              <div className="flex-1">
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Status:{" "}
                </span>
                <span
                  className={
                    invoiceStatus === "paid"
                      ? "text-green-600 dark:text-green-400"
                      : "text-amber-600 dark:text-amber-400"
                  }
                >
                  {invoiceStatus === "paid" ? "Paid ✓" : "Unpaid"}
                </span>
              </div>
              <button
                type="button"
                onClick={handleMarkAsPaid}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {invoiceStatus === "paid" ? "Mark unpaid" : "Mark as paid"}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Download */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
          Download options
        </h2>
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={allowFullGalleryDownload}
              onChange={(e) => setAllowFullGalleryDownload(e.target.checked)}
              className="rounded border-neutral-300 text-bizzi-blue focus:ring-bizzi-blue"
            />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Allow full gallery download
            </span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={allowSingleDownload}
              onChange={(e) => setAllowSingleDownload(e.target.checked)}
              className="rounded border-neutral-300 text-bizzi-blue focus:ring-bizzi-blue"
            />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Allow single image download
            </span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={allowSelectedDownload}
              onChange={(e) => setAllowSelectedDownload(e.target.checked)}
              className="rounded border-neutral-300 text-bizzi-blue focus:ring-bizzi-blue"
            />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Allow selected favorites download (when Phase 2 is live)
            </span>
          </label>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Free download limit (leave blank for unlimited)
            </label>
            <input
              type="number"
              min={0}
              value={freeDownloadLimit}
              onChange={(e) => setFreeDownloadLimit(e.target.value)}
              placeholder="Unlimited"
              className="w-32 rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>
        </div>
      </section>

      {/* Watermark */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
          Watermark
        </h2>
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={watermarkEnabled}
              onChange={(e) => setWatermarkEnabled(e.target.checked)}
              className="rounded border-neutral-300 text-bizzi-blue focus:ring-bizzi-blue"
            />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Enable watermark on previews
            </span>
          </label>
          {watermarkEnabled && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Position
                </label>
                <select
                  value={watermarkPosition}
                  onChange={(e) => setWatermarkPosition(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  <option value="center">Center</option>
                  <option value="bottom-right">Bottom right</option>
                  <option value="bottom-left">Bottom left</option>
                  <option value="top-right">Top right</option>
                  <option value="top-left">Top left</option>
                </select>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="flex shrink-0 flex-col items-center gap-2">
                  <div className="watermark-preview-bg flex h-20 w-24 items-center justify-center overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
                    {watermarkImageUrl || watermarkPreviewUrl ? (
                      <Image
                        src={watermarkPreviewUrl ?? watermarkImageUrl ?? ""}
                        alt="Watermark preview"
                        width={96}
                        height={80}
                        className="h-full w-full object-contain"
                        style={{
                          opacity: watermarkOpacity / 100,
                        }}
                        unoptimized
                      />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-neutral-400" />
                    )}
                  </div>
                  <input
                    ref={watermarkInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (!file.type.startsWith("image/")) {
                        setWatermarkError("Use PNG, JPG, WebP, or GIF. PNG with transparency recommended.");
                        return;
                      }
                      if (file.size > 2 * 1024 * 1024) {
                        setWatermarkError("Image must be under 2 MB");
                        return;
                      }
                      setWatermarkError(null);
                      setWatermarkFile(file);
                    }}
                    aria-label="Upload watermark"
                  />
                  <button
                    type="button"
                    onClick={() => watermarkInputRef.current?.click()}
                    className="text-sm text-bizzi-blue hover:underline"
                  >
                    Choose image
                  </button>
                  {watermarkFile && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!user || !watermarkFile) return;
                        setUploadingWatermark(true);
                        setWatermarkError(null);
                        try {
                          const token = await user.getIdToken();
                          const formData = new FormData();
                          formData.append("watermark", watermarkFile);
                          const res = await fetch(`/api/galleries/${galleryId}/watermark`, {
                            method: "POST",
                            headers: { Authorization: `Bearer ${token}` },
                            body: formData,
                          });
                          if (!res.ok) {
                            const data = await res.json().catch(() => ({}));
                            throw new Error(data.error ?? "Failed to upload watermark");
                          }
                          const data = await res.json();
                          setWatermarkImageUrl(data.image_url);
                          setWatermarkFile(null);
                        } catch (err) {
                          setWatermarkError(err instanceof Error ? err.message : "Failed to upload");
                        } finally {
                          setUploadingWatermark(false);
                        }
                      }}
                      disabled={uploadingWatermark}
                      className="flex items-center gap-1 rounded-lg bg-bizzi-blue px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {uploadingWatermark ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Upload"
                      )}
                    </button>
                  )}
                </div>
              </div>
              {watermarkError && (
                <p className="text-sm text-red-600 dark:text-red-400">{watermarkError}</p>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Opacity: {watermarkOpacity}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={watermarkOpacity}
                  onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Watermark applies to previews only, not delivered downloads. Minimum 1600px width recommended.
              </p>
            </>
          )}
        </div>
      </section>

      {/* Creative LUT */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
          Creative LUT
        </h2>
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={lutEnabled}
              onChange={(e) => setLutEnabled(e.target.checked)}
              className="rounded border-neutral-300 text-bizzi-blue focus:ring-bizzi-blue"
            />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Enable LUT preview
            </span>
          </label>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            This applies a visual preview style only. Your original files remain unchanged.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={lutInputRef}
              type="file"
              accept=".cube"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const ext = file.name.split(".").pop()?.toLowerCase();
                if (ext !== "cube") {
                  setLutError("Only .cube LUT files are supported.");
                  return;
                }
                if (file.size > 2 * 1024 * 1024) {
                  setLutError("LUT file must be under 2 MB.");
                  return;
                }
                setLutError(null);
                setLutFile(file);
              }}
              aria-label="Upload LUT"
            />
            <button
              type="button"
              onClick={() => lutInputRef.current?.click()}
              className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {lutStorageUrl ? "Replace LUT" : "Upload LUT"}
            </button>
            {lutStorageUrl && (
              <button
                type="button"
                onClick={async () => {
                  if (!user) return;
                  setUploadingLut(true);
                  setLutError(null);
                  try {
                    const token = await user.getIdToken();
                    const res = await fetch(`/api/galleries/${galleryId}/lut`, {
                      method: "DELETE",
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.error ?? "Failed to remove LUT");
                    }
                    setLutStorageUrl(null);
                    setLutFile(null);
                  } catch (err) {
                    setLutError(err instanceof Error ? err.message : "Failed to remove LUT");
                  } finally {
                    setUploadingLut(false);
                  }
                }}
                disabled={uploadingLut}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/30 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                {uploadingLut ? (
                  <Loader2 className="inline h-4 w-4 animate-spin" />
                ) : (
                  "Remove LUT"
                )}
              </button>
            )}
            {lutFile && (
              <button
                type="button"
                onClick={async () => {
                  if (!user || !lutFile) return;
                  setUploadingLut(true);
                  setLutError(null);
                  try {
                    const token = await user.getIdToken();
                    const formData = new FormData();
                    formData.append("lut", lutFile);
                    const res = await fetch(`/api/galleries/${galleryId}/lut`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${token}` },
                      body: formData,
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.error ?? "Failed to upload LUT");
                    }
                    const data = await res.json();
                    setLutStorageUrl(data.storage_url ?? null);
                    setLutFile(null);
                  } catch (err) {
                    setLutError(err instanceof Error ? err.message : "Failed to upload LUT");
                  } finally {
                    setUploadingLut(false);
                  }
                }}
                disabled={uploadingLut}
                className="flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {uploadingLut ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  "Upload"
                )}
              </button>
            )}
          </div>
          {lutError && (
            <p className="text-sm text-red-600 dark:text-red-400">{lutError}</p>
          )}
          {lutStorageUrl && !lutFile && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              LUT file is attached. Use Replace to change it, or Remove to clear.
            </p>
          )}
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-bizzi-blue px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
