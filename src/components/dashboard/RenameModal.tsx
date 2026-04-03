"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface RenameModalProps {
  open: boolean;
  onClose: () => void;
  currentName: string;
  onRename: (newName: string) => Promise<void>;
  itemType: "file" | "folder";
}

export default function RenameModal({
  open,
  onClose,
  currentName,
  onRename,
  itemType,
}: RenameModalProps) {
  const [name, setName] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Only reset name when modal opens - don't overwrite while user is typing (prevents
  // parent re-renders from wiping input and fixes "file appearing" / premature closure)
  useEffect(() => {
    if (open) {
      setName(currentName);
      setError(null);
      // Ensure input gets focus (fixes Space key being captured by FileCard when focus
      // briefly stays on the menu trigger after clicking Rename)
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- only sync on open

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = name.trim();
      if (!trimmed) {
        setError("Name cannot be empty");
        return;
      }
      if (trimmed === currentName) {
        onClose();
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await onRename(trimmed);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to rename");
      } finally {
        setLoading(false);
      }
    },
    [name, currentName, onRename, onClose]
  );

  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[280] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/70"
        aria-hidden
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-700">
          <h3 id="rename-modal-title" className="text-lg font-semibold text-neutral-900 dark:text-white">
            {itemType === "file" ? "Change name" : "Rename folder"}
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
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
          )}
          <div>
            <label htmlFor="rename-input" className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Name
            </label>
            <input
              ref={inputRef}
              id="rename-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              placeholder={`Enter new ${itemType} name`}
              autoFocus
              disabled={loading}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
            >
              {loading ? "Renaming…" : "Rename"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modal, document.body)
    : null;
}
