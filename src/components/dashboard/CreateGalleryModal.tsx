"use client";

import { useState } from "react";
import { X, Image as ImageIcon, Film } from "lucide-react";
import type { GalleryType } from "@/types/gallery";

interface CreateGalleryModalProps {
  onClose: () => void;
  onCreate: (input: {
    gallery_type: GalleryType;
    title: string;
    description?: string;
    event_date?: string;
    expiration_date?: string;
    access_mode?: string;
    password?: string;
    invited_emails?: string[];
    layout?: string;
    media_mode?: "final" | "raw";
    /** @deprecated */
    source_format?: "raw" | "jpg";
    delivery_mode?: string;
    download_policy?: string;
    allow_comments?: boolean;
    allow_favorites?: boolean;
    revision_limit_count?: number;
    invoice_url?: string;
    invoice_label?: string;
    invoice_required_for_download?: boolean;
    client_review_instructions?: string;
  }) => Promise<unknown>;
}

const ACCESS_MODES = [
  { value: "public", label: "Public link", desc: "Anyone with the link can view" },
  { value: "password", label: "Password", desc: "Requires a password to view" },
  { value: "invite_only", label: "Invite only", desc: "Only invited emails can access" },
] as const;

const LAYOUTS = [
  { value: "masonry", label: "Masonry" },
  { value: "justified", label: "Justified" },
  { value: "cinematic", label: "Cinematic" },
] as const;

const FINAL_RAW_PHOTO = [
  {
    value: "final" as const,
    label: "Final Photo Gallery",
    desc: "Use this for edited, client ready photos. Best for normal viewing, proofing, and delivery.",
  },
  {
    value: "raw" as const,
    label: "RAW Photo Gallery",
    desc: "Use this for original camera photo files such as ARW, CR3, NEF, and DNG. Best for source review and optional LUT based preview workflows.",
  },
] as const;

const FINAL_RAW_VIDEO = [
  {
    value: "final" as const,
    label: "Final Video Gallery",
    desc: "Use this for edited, client ready videos that are ready to watch, review, and download.",
  },
  {
    value: "raw" as const,
    label: "RAW Video Gallery",
    desc: "Use this for source or log based footage where creative preview tools like LUT preview may be needed.",
  },
] as const;

const VIDEO_DELIVERY_MODES = [
  { value: "video_review", label: "Video review", desc: "Watch, comment, heart, request revisions" },
  { value: "standard_client_gallery", label: "Client delivery", desc: "Showcase and approved download" },
] as const;

const VIDEO_DOWNLOAD_POLICIES = [
  { value: "none", label: "No downloads", desc: "Preview only, no file delivery" },
  { value: "preview_only", label: "Preview only", desc: "Optimized preview sources" },
  { value: "selected_assets", label: "Selected assets", desc: "Only creator-chosen videos" },
  { value: "all_assets", label: "All videos", desc: "All videos downloadable" },
] as const;

function TypeSelectionStep({
  selectedType,
  onSelect,
  onContinue,
}: {
  selectedType: GalleryType | null;
  onSelect: (t: GalleryType) => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <h3 className="text-center text-base font-medium text-neutral-700 dark:text-neutral-300">
        What type of gallery are you creating?
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onSelect("photo")}
          className={`flex flex-col items-start gap-3 rounded-xl border-2 p-5 text-left transition-all ${
            selectedType === "photo"
              ? "border-bizzi-blue bg-bizzi-blue/5 dark:border-bizzi-cyan dark:bg-bizzi-cyan/10"
              : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
          }`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
            <ImageIcon className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h4 className="font-semibold text-neutral-900 dark:text-white">Photo Gallery</h4>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Deliver photos for proofing, favorites, downloads, and branded client presentation.
            </p>
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-500">
              Best for: weddings, portraits, events
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => onSelect("video")}
          className={`flex flex-col items-start gap-3 rounded-xl border-2 p-5 text-left transition-all ${
            selectedType === "video"
              ? "border-bizzi-blue bg-bizzi-blue/5 dark:border-bizzi-cyan dark:bg-bizzi-cyan/10"
              : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
          }`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30">
            <Film className="h-6 w-6 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h4 className="font-semibold text-neutral-900 dark:text-white">Video Gallery</h4>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Deliver videos for review, comments, favorites, preview playback, revisions, and optional invoice-based approval.
            </p>
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-500">
              Best for: wedding films, reel reviews, client delivery
            </p>
          </div>
        </button>
      </div>
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onContinue}
          disabled={!selectedType}
          className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

export default function CreateGalleryModal({ onClose, onCreate }: CreateGalleryModalProps) {
  const [step, setStep] = useState<"type" | "form">("type");
  const [galleryType, setGalleryType] = useState<GalleryType | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [accessMode, setAccessMode] = useState<"public" | "password" | "invite_only">("public");
  const [password, setPassword] = useState("");
  const [invitedEmails, setInvitedEmails] = useState("");
  const [layout, setLayout] = useState<"masonry" | "justified" | "cinematic">("masonry");
  const [mediaMode, setMediaMode] = useState<"final" | "raw">("final");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Video-specific
  const [deliveryMode, setDeliveryMode] = useState<string>("video_review");
  const [downloadPolicy, setDownloadPolicy] = useState<string>("none");
  const [allowComments, setAllowComments] = useState(true);
  const [allowFavorites, setAllowFavorites] = useState(true);
  const [revisionLimitCount, setRevisionLimitCount] = useState(2);
  const [invoiceUrl, setInvoiceUrl] = useState("");
  const [invoiceLabel, setInvoiceLabel] = useState("");
  const [invoiceRequiredForDownload, setInvoiceRequiredForDownload] = useState(false);
  const [clientReviewInstructions, setClientReviewInstructions] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !galleryType) return;
    setSubmitting(true);
    setError(null);
    try {
      const base = {
        gallery_type: galleryType,
        title: title.trim(),
        description: description.trim() || undefined,
        event_date: eventDate || undefined,
        expiration_date: expirationDate || undefined,
        access_mode: accessMode,
        password: accessMode === "password" ? password : undefined,
        invited_emails:
          accessMode === "invite_only"
            ? invitedEmails.split(/[\s,]+/).filter(Boolean)
            : undefined,
        layout,
      };
      const photoExtras =
        galleryType === "photo"
          ? { media_mode: mediaMode }
          : {
              media_mode: mediaMode,
              delivery_mode: deliveryMode,
              download_policy: downloadPolicy,
              allow_comments: allowComments,
              allow_favorites: allowFavorites,
              revision_limit_count: revisionLimitCount,
              invoice_url: invoiceUrl.trim() || undefined,
              invoice_label: invoiceLabel.trim() || undefined,
              invoice_required_for_download: invoiceRequiredForDownload,
              client_review_instructions: clientReviewInstructions.trim() || undefined,
            };
      await onCreate({ ...base, ...photoExtras } as Parameters<typeof onCreate>[0]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create gallery");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    setStep("type");
    setError(null);
  };

  if (step === "type") {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50">
        <div className="flex min-h-full items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
          <div className="my-auto w-full max-w-3xl rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-4 sm:px-6 dark:border-neutral-700">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">New gallery</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <TypeSelectionStep
              selectedType={galleryType}
              onSelect={(t) => setGalleryType(t)}
              onContinue={() => {
                if (galleryType) setStep("form");
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50">
      <div className="flex min-h-full items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
        <div className="my-auto flex w-full max-w-3xl max-h-[calc(100dvh-5rem)] flex-col rounded-xl border border-neutral-200 bg-white shadow-xl sm:max-h-[calc(100dvh-6rem)] dark:border-neutral-700">
          <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-4 sm:px-6 dark:border-neutral-700">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBack}
                className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                aria-label="Back"
              >
                ←
              </button>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                {galleryType === "video" ? "New video gallery" : "New photo gallery"}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex-1 min-h-0 space-y-4 overflow-y-auto p-4 sm:p-6"
          >
            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Gallery title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  galleryType === "video"
                    ? "e.g. Smith Wedding Film 2024"
                    : "e.g. Smith Wedding 2024"
                }
                className="w-full rounded-lg border border-neutral-200 px-4 py-2 text-neutral-900 placeholder-neutral-400 outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short description for your clients..."
                rows={2}
                className="w-full rounded-lg border border-neutral-200 px-4 py-2 text-neutral-900 placeholder-neutral-400 outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Event date
                </label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 px-4 py-2 text-neutral-900 outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Expires
                </label>
                <input
                  type="date"
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 px-4 py-2 text-neutral-900 outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Access
              </label>
              <div className="space-y-2">
                {ACCESS_MODES.map((m) => (
                  <label
                    key={m.value}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-700"
                  >
                    <input
                      type="radio"
                      name="access"
                      value={m.value}
                      checked={accessMode === m.value}
                      onChange={() => setAccessMode(m.value)}
                      className="mt-1"
                    />
                    <div>
                      <span className="font-medium text-neutral-900 dark:text-white">{m.label}</span>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">{m.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {accessMode === "password" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Gallery password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full rounded-lg border border-neutral-200 px-4 py-2 text-neutral-900 outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
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
                  className="w-full rounded-lg border border-neutral-200 px-4 py-2 text-neutral-900 outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>
            )}

            {galleryType === "photo" && (
              <div>
                <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Gallery profile
                </label>
                <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
                  Final means edited, delivery ready, preview friendly media. RAW means original camera
                  files or workflows that need special preview (LUT review, etc.).
                </p>
                <div className="space-y-2">
                  {FINAL_RAW_PHOTO.map((s) => (
                    <label
                      key={s.value}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-700"
                    >
                      <input
                        type="radio"
                        name="media_mode_photo"
                        value={s.value}
                        checked={mediaMode === s.value}
                        onChange={() => setMediaMode(s.value)}
                        className="mt-1"
                      />
                      <div>
                        <span className="font-medium text-neutral-900 dark:text-white">
                          {s.label}
                        </span>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">{s.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {galleryType === "video" && (
              <div>
                <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Gallery profile
                </label>
                <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
                  Final is for deliverable exports. RAW is for source or log footage where on screen LUT
                  preview may help during review.
                </p>
                <div className="space-y-2">
                  {FINAL_RAW_VIDEO.map((s) => (
                    <label
                      key={s.value}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-700"
                    >
                      <input
                        type="radio"
                        name="media_mode_video"
                        value={s.value}
                        checked={mediaMode === s.value}
                        onChange={() => setMediaMode(s.value)}
                        className="mt-1"
                      />
                      <div>
                        <span className="font-medium text-neutral-900 dark:text-white">
                          {s.label}
                        </span>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">{s.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {galleryType === "video" && (
              <>
                <div>
                  <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Delivery mode
                  </label>
                  <div className="space-y-2">
                    {VIDEO_DELIVERY_MODES.map((m) => (
                      <label
                        key={m.value}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-700"
                      >
                        <input
                          type="radio"
                          name="delivery_mode"
                          value={m.value}
                          checked={deliveryMode === m.value}
                          onChange={() => setDeliveryMode(m.value)}
                          className="mt-1"
                        />
                        <div>
                          <span className="font-medium text-neutral-900 dark:text-white">
                            {m.label}
                          </span>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">{m.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Download policy
                  </label>
                  <div className="space-y-2">
                    {VIDEO_DOWNLOAD_POLICIES.map((p) => (
                      <label
                        key={p.value}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-700"
                      >
                        <input
                          type="radio"
                          name="download_policy"
                          value={p.value}
                          checked={downloadPolicy === p.value}
                          onChange={() => setDownloadPolicy(p.value)}
                          className="mt-1"
                        />
                        <div>
                          <span className="font-medium text-neutral-900 dark:text-white">
                            {p.label}
                          </span>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">{p.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-4">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={allowComments}
                      onChange={(e) => setAllowComments(e.target.checked)}
                    />
                    <span className="text-sm">Allow comments</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={allowFavorites}
                      onChange={(e) => setAllowFavorites(e.target.checked)}
                    />
                    <span className="text-sm">Allow favorites</span>
                  </label>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Revision rounds (optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={revisionLimitCount}
                    onChange={(e) => setRevisionLimitCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-full rounded-lg border border-neutral-200 px-4 py-2 text-neutral-900 outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Invoice URL (optional)
                  </label>
                  <input
                    type="url"
                    value={invoiceUrl}
                    onChange={(e) => setInvoiceUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-neutral-200 px-4 py-2 text-neutral-900 placeholder-neutral-400 outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Paste your hosted invoice or payment link. No Stripe Connect required.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Invoice label (optional)
                  </label>
                  <input
                    type="text"
                    value={invoiceLabel}
                    onChange={(e) => setInvoiceLabel(e.target.value)}
                    placeholder="View Invoice"
                    className="w-full rounded-lg border border-neutral-200 px-4 py-2 text-neutral-900 placeholder-neutral-400 outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={invoiceRequiredForDownload}
                    onChange={(e) => setInvoiceRequiredForDownload(e.target.checked)}
                  />
                  <span className="text-sm">Gate downloads until invoice is paid</span>
                </label>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Client review instructions (optional)
                  </label>
                  <textarea
                    value={clientReviewInstructions}
                    onChange={(e) => setClientReviewInstructions(e.target.value)}
                    placeholder="How should clients leave feedback?"
                    rows={2}
                    className="w-full rounded-lg border border-neutral-200 px-4 py-2 text-neutral-900 placeholder-neutral-400 outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Layout
              </label>
              <div className="flex gap-2">
                {LAYOUTS.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => setLayout(l.value)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      layout === l.value
                        ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue"
                        : "border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-neutral-700 dark:text-neutral-400"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !title.trim()}
                className="flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
              >
                <ImageIcon className="h-4 w-4" />
                {submitting ? "Creating…" : "Create gallery"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
