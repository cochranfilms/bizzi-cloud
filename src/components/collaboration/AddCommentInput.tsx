"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
}

export default function AddCommentInput({
  onSubmit,
  placeholder = "Add a comment…",
  onCancel,
  showCancel = false,
  autoFocus = false,
  immersiveChrome = false,
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
    ? "min-h-[2.5rem] w-full resize-none rounded-none border border-white/25 bg-neutral-950/45 px-3 py-2 text-sm leading-snug text-white placeholder-neutral-400 focus:border-bizzi-cyan focus:outline-none focus:ring-1 focus:ring-bizzi-cyan/30 disabled:opacity-50"
    : "min-h-[2.5rem] w-full resize-none rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm leading-snug text-neutral-900 placeholder-neutral-400 focus:border-bizzi-blue focus:outline-none focus:ring-1 focus:ring-bizzi-blue/20 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-white dark:placeholder-neutral-500 dark:focus:border-bizzi-cyan dark:focus:ring-bizzi-cyan/20";

  return (
    <div className="flex items-end gap-2">
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
          className={`flex h-9 w-9 items-center justify-center text-white transition-opacity disabled:opacity-50 ${
            immersiveChrome
              ? "rounded-none bg-bizzi-cyan hover:bg-bizzi-cyan/90"
              : "rounded-lg bg-bizzi-blue hover:bg-bizzi-blue/90 dark:rounded-lg dark:bg-bizzi-cyan dark:hover:bg-bizzi-cyan/90"
          }`}
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
