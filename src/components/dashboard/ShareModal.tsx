"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Copy, Check, Link2, Lock, UserPlus } from "lucide-react";
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
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [accessLevel, setAccessLevel] = useState<"private" | "public">("private");
  const [permission, setPermission] = useState<"view" | "edit">("view");
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const shareUrl =
    shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/s/${shareToken}`
      : null;

  const fetchExistingShare = useCallback(async () => {
    if (!linkedDriveId || !user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/shares?linked_drive_id=${encodeURIComponent(linkedDriveId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setShareToken(data.token);
        setAccessLevel((data.access_level as "private" | "public") ?? "private");
        setInvitedEmails(data.invited_emails ?? []);
      }
    } catch {
      // No existing share, will create on first action
    }
  }, [linkedDriveId, user]);

  useEffect(() => {
    if (open && linkedDriveId) {
      fetchExistingShare();
    } else if (!open) {
      setShareToken(null);
      setError(null);
      setCopied(false);
      setEmailInput("");
    }
  }, [open, linkedDriveId, fetchExistingShare]);

  const ensureShare = useCallback(async (): Promise<string | null> => {
    if (!linkedDriveId || !user) return null;
    if (shareToken) return shareToken;

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
          access_level: accessLevel,
          invited_emails: invitedEmails,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create share");
      }
      const data = await res.json();
      setShareToken(data.token);
      return data.token;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create share");
      return null;
    } finally {
      setLoading(false);
    }
  }, [linkedDriveId, user, shareToken, permission, accessLevel, invitedEmails]);

  const copyLink = useCallback(async () => {
    const token = await ensureShare();
    if (!token) return;
    const url = `${window.location.origin}/s/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [ensureShare]);

  const addEmail = useCallback(async () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;
    if (invitedEmails.includes(trimmed)) return;
    const next = [...invitedEmails, trimmed];
    setInvitedEmails(next);
    setEmailInput("");
    const token = await ensureShare();
    if (token) {
      setLoading(true);
      setError(null);
      try {
        const authToken = await user?.getIdToken();
        if (!authToken) return;
        const res = await fetch(`/api/shares/${token}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ invited_emails: next }),
        });
        if (!res.ok) throw new Error("Failed to add");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add");
      } finally {
        setLoading(false);
      }
    }
  }, [emailInput, invitedEmails, ensureShare, user]);

  const removeEmail = useCallback(
    async (email: string) => {
      const next = invitedEmails.filter((e) => e !== email);
      setInvitedEmails(next);
      if (shareToken && user) {
        setLoading(true);
        setError(null);
        try {
          const authToken = await user.getIdToken();
          const res = await fetch(`/api/shares/${shareToken}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ invited_emails: next }),
          });
          if (!res.ok) throw new Error("Failed to remove");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to remove");
        } finally {
          setLoading(false);
        }
      }
    },
    [invitedEmails, shareToken, user]
  );

  const saveChanges = useCallback(
    async (overrides?: { access_level?: "private" | "public"; invited_emails?: string[] }) => {
      if (!shareToken || !user) return;
      const level = overrides?.access_level ?? accessLevel;
      const emails = overrides?.invited_emails ?? invitedEmails;
      setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/shares/${shareToken}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            access_level: level,
            invited_emails: emails,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to update");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update");
      } finally {
        setLoading(false);
      }
    },
    [shareToken, user, accessLevel, invitedEmails]
  );

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
        aria-hidden
      />
      <div
        className="relative z-10 w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-700">
          <h3 id="share-modal-title" className="text-lg font-semibold text-neutral-900 dark:text-white">
            Share &quot;{folderName}&quot;
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {error && (
            <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
          )}

          {/* Copy link - primary action */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copyLink}
              disabled={!linkedDriveId || !user || loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 disabled:opacity-50"
            >
              <Link2 className="h-4 w-4" />
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-green-600" />
                  Copied
                </>
              ) : (
                "Copy link"
              )}
            </button>
          </div>

          {shareUrl && (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800">
              <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                {shareUrl}
              </p>
            </div>
          )}

          {/* Access level */}
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              General access
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAccessLevel("private");
                  if (shareToken && user) saveChanges({ access_level: "private" });
                }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  accessLevel === "private"
                    ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                <Lock className="h-4 w-4" />
                Private
              </button>
              <button
                type="button"
                onClick={() => {
                  setAccessLevel("public");
                  if (shareToken && user) saveChanges({ access_level: "public" });
                }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  accessLevel === "public"
                    ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                <Link2 className="h-4 w-4" />
                Anyone with link
              </button>
            </div>
            <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              {accessLevel === "private"
                ? "Only people you add can access"
                : "Anyone on the internet with the link can view"}
            </p>
          </div>

          {/* Permission */}
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

          {/* Add people */}
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Add people
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Add people by email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())}
                className="flex-1 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
              <button
                type="button"
                onClick={addEmail}
                className="flex items-center gap-1 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
              >
                <UserPlus className="h-4 w-4" />
                Add
              </button>
            </div>
          </div>

          {/* People with access */}
          {(user?.email || invitedEmails.length > 0) && (
            <div>
              <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                People with access
              </p>
              <div className="space-y-2">
                {user?.email && (
                  <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700">
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">
                      {user.email} (you)
                    </span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      Owner
                    </span>
                  </div>
                )}
                {invitedEmails.map((em) => (
                  <div
                    key={em}
                    className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700"
                  >
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">
                      {em}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeEmail(em)}
                      className="text-xs text-red-600 hover:underline dark:text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-neutral-200 p-4 dark:border-neutral-700">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modal, document.body)
    : null;
}
