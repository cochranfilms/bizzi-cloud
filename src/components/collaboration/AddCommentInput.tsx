"use client";

import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";

interface AddCommentInputProps {
  onSubmit: (body: string) => Promise<boolean>;
  placeholder?: string;
  onCancel?: () => void;
  showCancel?: boolean;
  autoFocus?: boolean;
}

export default function AddCommentInput({
  onSubmit,
  placeholder = "Add a comment…",
  onCancel,
  showCancel = false,
  autoFocus = false,
}: AddCommentInputProps) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const handleSubmit = async () => {
    const trimmed = body.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    const ok = await onSubmit(trimmed);
    setSubmitting(false);
    if (ok) {
      setBody("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex gap-2">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 2000))}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={2}
        disabled={submitting}
        className="min-h-[4rem] w-full resize-y rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-900 placeholder-neutral-400 focus:border-bizzi-blue focus:outline-none focus:ring-1 focus:ring-bizzi-blue/20 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-white dark:placeholder-neutral-500 dark:focus:border-bizzi-cyan dark:focus:ring-bizzi-cyan/20"
      />
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!body.trim() || submitting}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bizzi-blue text-white transition-opacity hover:bg-bizzi-blue/90 disabled:opacity-50 dark:bg-bizzi-cyan dark:hover:bg-bizzi-cyan/90"
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
