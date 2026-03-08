"use client";

import { useState, useCallback, useEffect } from "react";
import { X, Lock, Calendar, Download, File } from "lucide-react";
import type { Transfer, TransferPermission } from "@/types/transfer";
import { useTransfers } from "@/context/TransferContext";

interface EditTransferModalProps {
  open: boolean;
  onClose: () => void;
  transfer: Transfer | null;
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toISOString().slice(0, 16);
}

export default function EditTransferModal({
  open,
  onClose,
  transfer,
}: EditTransferModalProps) {
  const { updateTransfer } = useTransfers();
  const [permission, setPermission] = useState<TransferPermission>("downloadable");
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && transfer) {
      setPermission(transfer.permission ?? "downloadable");
      setPasswordEnabled(!!transfer.hasPassword);
      setPassword("");
      setExpiresAt(toDatetimeLocal(transfer.expiresAt));
      setError("");
    }
  }, [open, transfer]);

  const handleSubmit = useCallback(async () => {
    if (!transfer) return;
    if (passwordEnabled && !password.trim() && !transfer.hasPassword) {
      setError("Enter a password when password protection is enabled.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updates: {
      permission?: TransferPermission;
      expiresAt?: string | null;
      password?: string | null;
    } = {
        permission,
        expiresAt: expiresAt ? expiresAt : null,
      };
      if (!passwordEnabled) {
        updates.password = null;
      } else if (password.trim()) {
        updates.password = password.trim();
      }
      await updateTransfer(transfer.slug, updates);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update transfer");
    } finally {
      setSaving(false);
    }
  }, [transfer, permission, passwordEnabled, password, expiresAt, updateTransfer, onClose]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!open || !transfer) return null;

  return (
    <div className="fixed inset-0 z-50 flex min-h-screen items-start justify-center overflow-y-auto p-4 pt-16 pb-8 sm:items-center sm:pt-4">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={handleClose}
        aria-hidden
      />
      <div className="relative z-10 my-4 flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900 sm:my-0">
        <div className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-700">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Edit transfer
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
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Editing: <span className="font-medium text-neutral-900 dark:text-white">{transfer.name}</span>
          </p>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Permission */}
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Recipient access
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPermission("downloadable")}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  permission === "downloadable"
                    ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                <Download className="h-4 w-4" />
                Downloadable
              </button>
              <button
                type="button"
                onClick={() => setPermission("view")}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  permission === "view"
                    ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                <File className="h-4 w-4" />
                View only
              </button>
            </div>
          </div>

          {/* Password protection */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPasswordEnabled(!passwordEnabled)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  passwordEnabled
                    ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                <Lock className="h-4 w-4" />
                Password protect
              </button>
            </div>
            {passwordEnabled && (
              <input
                type="password"
                placeholder={transfer.hasPassword ? "Enter new password (leave blank to keep current)" : "Enter password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            )}
          </div>

          {/* Expiration */}
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
              <Calendar className="h-4 w-4" />
              Expiration date
            </label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Leave empty for no expiration
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-200 p-4 dark:border-neutral-700">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || (passwordEnabled && !password.trim() && !transfer.hasPassword)}
            className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
