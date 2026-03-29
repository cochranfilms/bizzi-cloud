"use client";

import { Check, Loader2, RotateCcw } from "lucide-react";

export default function StickyUnsavedBar({
  show,
  saving,
  showSuccess,
  onSave,
  onDiscard,
  saveLabel = "Save changes",
  discardLabel = "Discard",
}: {
  show: boolean;
  saving: boolean;
  showSuccess?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  saveLabel?: string;
  discardLabel?: string;
}) {
  if (!show && !showSuccess) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] px-4"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-t-xl border border-neutral-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm dark:border-neutral-600 dark:bg-neutral-900/95 ${
          showSuccess ? "ring-1 ring-green-500/30" : ""
        }`}
      >
        <div className="min-w-0 flex-1">
          {showSuccess ? (
            <p className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-300">
              <Check className="h-4 w-4 shrink-0" aria-hidden />
              Saved
            </p>
          ) : (
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              <span className="font-medium text-neutral-800 dark:text-neutral-100">Unsaved changes</span>
              {" · "}
              Save or discard before leaving.
            </p>
          )}
        </div>
        {!showSuccess ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onDiscard}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              {discardLabel}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-bizzi-blue px-3 py-2 text-xs font-medium text-white hover:bg-bizzi-cyan disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              {saveLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
