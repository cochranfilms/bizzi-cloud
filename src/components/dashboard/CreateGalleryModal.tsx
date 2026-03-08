"use client";

import { useState } from "react";
import { X, ImagePlus } from "lucide-react";

interface CreateGalleryModalProps {
  onClose: () => void;
  onCreate: (input: {
    title: string;
    description?: string;
    event_date?: string;
    expiration_date?: string;
    access_mode?: string;
    password?: string;
    pin?: string;
    invited_emails?: string[];
    layout?: string;
  }) => Promise<unknown>;
}

const ACCESS_MODES = [
  { value: "public", label: "Public link", desc: "Anyone with the link can view" },
  { value: "password", label: "Password", desc: "Requires a password to view" },
  { value: "pin", label: "Download PIN", desc: "View freely, PIN required for download" },
  { value: "invite_only", label: "Invite only", desc: "Only invited emails can access" },
] as const;

const LAYOUTS = [
  { value: "masonry", label: "Masonry" },
  { value: "justified", label: "Justified" },
  { value: "cinematic", label: "Cinematic" },
] as const;

export default function CreateGalleryModal({ onClose, onCreate }: CreateGalleryModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [accessMode, setAccessMode] = useState<"public" | "password" | "pin" | "invite_only">("public");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [invitedEmails, setInvitedEmails] = useState("");
  const [layout, setLayout] = useState<"masonry" | "justified" | "cinematic">("masonry");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim() || undefined,
        event_date: eventDate || undefined,
        expiration_date: expirationDate || undefined,
        access_mode: accessMode,
        password: accessMode === "password" ? password : undefined,
        pin: accessMode === "pin" ? pin : undefined,
        invited_emails: accessMode === "invite_only"
          ? invitedEmails.split(/[\s,]+/).filter(Boolean)
          : undefined,
        layout,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create gallery");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-700">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            New gallery
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
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
              placeholder="e.g. Smith Wedding 2024"
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

          <div className="grid grid-cols-2 gap-4">
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

          {accessMode === "pin" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Download PIN
              </label>
              <input
                type="text"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="e.g. 1234"
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
              <ImagePlus className="h-4 w-4" />
              {submitting ? "Creating…" : "Create gallery"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
