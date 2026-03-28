"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { Send } from "lucide-react";

const MAX_HEIGHT_PX = 128;
const MIN_HEIGHT_PX = 40;

interface AddCommentInputProps {
  onSubmit: (body: string) => Promise<boolean>;
  placeholder?: string;
  onCancel?: () => void;
  showCancel?: boolean;
  autoFocus?: boolean;
  /** High-contrast chrome on glass/frosted immersive panels */
  immersiveChrome?: boolean;
  /** When `immersiveChrome`, pass theme from parent (single source of truth). */
  immersiveIsDark?: boolean;
  /** Signed-in user avatar in immersive comment composer */
  composerPhotoURL?: string | null;
  /** For initials fallback when `composerPhotoURL` is empty */
  composerDisplayLabel?: string;
}

function composerInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return label.slice(0, 2).toUpperCase() || "?";
}

export default function AddCommentInput({
  onSubmit,
  placeholder = "Add a comment…",
  onCancel,
  showCancel = false,
  autoFocus = false,
  immersiveChrome = false,
  immersiveIsDark = false,
  composerPhotoURL,
  composerDisplayLabel = "",
}: AddCommentInputProps) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const syncHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(MAX_HEIGHT_PX, Math.max(MIN_HEIGHT_PX, el.scrollHeight));
    el.style.height = `${next}px`;
  }, []);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    syncHeight();
  }, [body, syncHeight]);

  const handleSubmit = async () => {
    const trimmed = body.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    const ok = await onSubmit(trimmed);
    setSubmitting(false);
    if (ok) {
      setBody("");
      requestAnimationFrame(syncHeight);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const inputClass = immersiveChrome
    ? immersiveIsDark
      ? "min-h-[2.5rem] w-full resize-none rounded-xl border border-white/12 bg-neutral-900/55 px-3 py-2 text-sm leading-snug text-white placeholder:text-neutral-500 focus:border-bizzi-cyan/50 focus:outline-none focus:ring-2 focus:ring-bizzi-cyan/20 disabled:opacity-50"
      : "min-h-[2.5rem] w-full resize-none rounded-xl border border-neutral-200/95 bg-white px-3 py-2 text-sm leading-snug text-neutral-900 placeholder:text-neutral-500 focus:border-bizzi-blue/45 focus:outline-none focus:ring-2 focus:ring-bizzi-blue/15 disabled:opacity-50"
    : "min-h-[2.5rem] w-full resize-none rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm leading-snug text-neutral-900 placeholder-neutral-400 focus:border-bizzi-blue focus:outline-none focus:ring-1 focus:ring-bizzi-blue/20 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-white dark:placeholder-neutral-500 dark:focus:border-bizzi-cyan dark:focus:ring-bizzi-cyan/20";

  const photo = composerPhotoURL?.trim() || null;
  const showComposerAvatar = immersiveChrome && !!composerDisplayLabel.trim();

  const sendBtnClass = immersiveChrome
    ? immersiveIsDark
      ? "rounded-xl bg-bizzi-cyan hover:bg-bizzi-cyan/90"
      : "rounded-xl bg-bizzi-blue hover:bg-bizzi-blue/90"
    : "rounded-lg bg-bizzi-blue hover:bg-bizzi-blue/90 dark:rounded-lg dark:bg-bizzi-cyan dark:hover:bg-bizzi-cyan/90";

  return (
    <div className="flex items-end gap-2">
      {showComposerAvatar ? (
        <div
          className={`relative mb-px h-9 w-9 shrink-0 overflow-hidden rounded-full ${
            photo
              ? ""
              : immersiveIsDark
                ? "flex items-center justify-center bg-white/12 text-[11px] font-semibold text-white"
                : "flex items-center justify-center bg-neutral-200 text-[11px] font-semibold text-neutral-800"
          }`}
          aria-hidden
        >
          {photo ? (
            <Image
              src={photo}
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 object-cover"
              unoptimized
            />
          ) : (
            composerInitials(composerDisplayLabel)
          )}
        </div>
      ) : null}
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => {
          setBody(e.target.value.slice(0, 2000));
          requestAnimationFrame(syncHeight);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        disabled={submitting}
        className={inputClass}
        style={{ maxHeight: MAX_HEIGHT_PX }}
      />
      <div className="flex shrink-0 flex-col gap-1 pb-0.5">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!body.trim() || submitting}
          className={`flex h-9 w-9 items-center justify-center text-white transition-opacity disabled:opacity-50 ${sendBtnClass}`}
          aria-label="Send comment"
        >
          <Send className="h-4 w-4" />
        </button>
        {showCancel && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
