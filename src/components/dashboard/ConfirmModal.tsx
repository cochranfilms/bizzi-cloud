"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { getThemeVariables } from "@/lib/enterprise-themes";
import type { EnterpriseThemeId } from "@/types/enterprise";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  /** When set, use enterprise primary color for non-destructive actions */
  enterpriseTheme?: EnterpriseThemeId | null;
}

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = "Confirm",
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  enterpriseTheme = null,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!loading) onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, loading]);

  const handleConfirm = async () => {
    await onConfirm();
  };

  if (!open) return null;

  const defaultConfirmLabel = destructive ? "Delete" : "OK";
  const useEnterprisePrimary =
    !destructive && enterpriseTheme && enterpriseTheme !== "bizzi";
  const themeVars =
    enterpriseTheme && enterpriseTheme !== "bizzi"
      ? (getThemeVariables(enterpriseTheme) as React.CSSProperties)
      : undefined;

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      {...(themeVars && {
        "data-org-theme": enterpriseTheme,
        style: themeVars,
      })}
    >
      <div
        className="absolute inset-0 bg-black/70"
        aria-hidden
        onClick={loading ? undefined : onClose}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-700">
          <h3
            id="confirm-modal-title"
            className="text-lg font-semibold text-neutral-900 dark:text-white"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">
          <div className="mb-4 flex items-start gap-4">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                destructive
                  ? "bg-red-100 dark:bg-red-950/50"
                  : useEnterprisePrimary
                    ? "bg-[var(--enterprise-primary)]/10"
                    : "bg-bizzi-blue/10 dark:bg-bizzi-blue/20"
              }`}
            >
              <AlertTriangle
                className={`h-6 w-6 ${
                  destructive
                    ? "text-red-600 dark:text-red-400"
                    : useEnterprisePrimary
                      ? "text-[var(--enterprise-primary)]"
                      : "text-bizzi-blue"
                }`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {message}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
                destructive
                  ? "bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                  : useEnterprisePrimary
                    ? "bg-[var(--enterprise-primary)] hover:opacity-90"
                    : "bg-bizzi-blue hover:bg-bizzi-cyan dark:bg-bizzi-blue dark:hover:bg-bizzi-cyan"
              }`}
            >
              {loading ? "Deleting…" : confirmLabel ?? defaultConfirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modal, document.body)
    : null;
}
