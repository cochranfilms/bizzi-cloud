"use client";

import { useState, useCallback } from "react";
import { X, Copy, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  folderName: string;
  linkedDriveId?: string;
}

export default function ShareModal({
  open,
  onClose,
  folderName,
  linkedDriveId,
}: ShareModalProps) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"view" | "edit">("edit");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleInvite = useCallback(async () => {
    if (!linkedDriveId || !user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/shares", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          linked_drive_id: linkedDriveId,
          permission,
          invited_emails: email.trim() ? [email.trim()] : [],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create share");
      }
      const data = await res.json();
      const fullUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}${data.share_url}`
          : data.share_url;
      setShareUrl(fullUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create share");
    } finally {
      setLoading(false);
    }
  }, [linkedDriveId, user, permission, email]);

  const copyLink = useCallback(() => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  const handleClose = useCallback(() => {
    setShareUrl(null);
    setError(null);
    setCopied(false);
    onClose();
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-700">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Share &quot;{folderName}&quot;
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <label
              htmlFor="share-email"
              className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Email address
            </label>
            <input
              id="share-email"
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Permission
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPermission("view")}
                className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  permission === "view"
                    ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                View
              </button>
              <button
                type="button"
                onClick={() => setPermission("edit")}
                className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  permission === "edit"
                    ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                Edit
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4 border-t border-neutral-200 p-4 dark:border-neutral-700">
          {error && (
            <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
          )}
          {shareUrl ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Share link created
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                />
                <button
                  type="button"
                  onClick={copyLink}
                  className="flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-green-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {shareUrl ? "Done" : "Cancel"}
            </button>
            {!shareUrl && (
              <button
                type="button"
                onClick={handleInvite}
                disabled={!linkedDriveId || !user || loading}
                className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
              >
                {loading ? "Creating…" : "Invite"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
