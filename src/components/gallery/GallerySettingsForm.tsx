"use client";

import { useState } from "react";
import { Save, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { GALLERY_BACKGROUND_THEMES } from "@/lib/gallery-background-themes";

interface GallerySettingsFormProps {
  galleryId: string;
  initialData: {
    title?: string;
    description?: string | null;
    event_date?: string | null;
    expiration_date?: string | null;
    access_mode?: string;
    invited_emails?: string[];
    layout?: string;
    branding?: Record<string, unknown>;
    download_settings?: Record<string, unknown>;
    watermark?: Record<string, unknown>;
  };
}

export default function GallerySettingsForm({
  galleryId,
  initialData,
}: GallerySettingsFormProps) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initialData.title ?? "");
  const [description, setDescription] = useState(initialData.description ?? "");
  const [eventDate, setEventDate] = useState(initialData.event_date ?? "");
  const [expirationDate, setExpirationDate] = useState(initialData.expiration_date ?? "");
  const [accessMode, setAccessMode] = useState(initialData.access_mode ?? "public");
  const [invitedEmails, setInvitedEmails] = useState(
    (initialData.invited_emails ?? []).join(", ")
  );
  const [layout, setLayout] = useState(initialData.layout ?? "masonry");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");

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

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const body: Record<string, unknown> = {
        title: title.trim(),
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
        },
      };
      if (accessMode === "password" && password) body.password = password;
      if (accessMode === "pin" && pin) body.pin = pin;

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
        throw new Error(data.error ?? "Failed to save");
      }
      setSaved(true);
      setPassword("");
      setPin("");
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
              <option value="pin">Download PIN (view freely, PIN for download)</option>
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
          {accessMode === "pin" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                New download PIN (leave blank to keep current)
              </label>
              <input
                type="text"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="e.g. 1234"
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
                Logo upload coming in a future update. Watermark applies to previews only, not
                delivered downloads.
              </p>
            </>
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
