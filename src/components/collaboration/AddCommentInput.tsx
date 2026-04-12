"use client";

import { useState, useRef, useEffect, useCallback, type CSSProperties } from "react";
import Image from "next/image";
import { Send } from "lucide-react";
import type { ImmersiveVideoCommentContextValue } from "@/context/ImmersiveVideoCommentContext";
import { formatVideoCommentTimecodeWithMs } from "@/lib/video-comment-timecode";

const MAX_HEIGHT_PX = 128;
const MIN_HEIGHT_PX = 40;

interface AddCommentInputProps {
  onSubmit: (body: string, videoTimestampSec?: number | null) => Promise<boolean>;
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
  /**
   * When set (immersive video preview), timecode follows playback; focus pauses and pins time for the draft.
   */
  immersiveVideoComment?: ImmersiveVideoCommentContextValue | null;
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
  immersiveVideoComment = null,
}: AddCommentInputProps) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pinnedVideoSec, setPinnedVideoSec] = useState<number | null>(null);
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
    let ts: number | null = null;
    if (immersiveVideoComment) {
      if (pinnedVideoSec != null && Number.isFinite(pinnedVideoSec)) {
        ts = pinnedVideoSec;
      } else {
        const live = immersiveVideoComment.livePlaybackSec;
        ts = Number.isFinite(live) ? Math.max(0, live) : null;
      }
    }
    const ok = await onSubmit(trimmed, ts);
    setSubmitting(false);
    if (ok) {
      setBody("");
      setPinnedVideoSec(null);
      requestAnimationFrame(syncHeight);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const shellRowClass = immersiveChrome
    ? immersiveIsDark
      ? "flex min-h-[3rem] w-full min-w-0 items-center gap-3 rounded-full border border-white/16 bg-white/[0.07] px-3.5 py-2.5 shadow-inner shadow-black/25 focus-within:border-white/30 focus-within:ring-2 focus-within:ring-bizzi-cyan/25"
      : "flex min-h-[3rem] w-full min-w-0 items-center gap-3 rounded-full border border-neutral-200 bg-white px-3.5 py-2.5 shadow-sm focus-within:border-bizzi-blue/45 focus-within:ring-2 focus-within:ring-bizzi-blue/12"
    : "";

  const textareaInShellClass = immersiveChrome
    ? immersiveIsDark
      ? "min-h-[1.25rem] min-w-0 flex-1 resize-none border-0 bg-transparent py-0.5 text-[15px] leading-snug text-white placeholder:text-neutral-500 focus:outline-none focus:ring-0 disabled:opacity-50"
      : "min-h-[1.25rem] min-w-0 flex-1 resize-none border-0 bg-transparent py-0.5 text-[15px] leading-snug text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-0 disabled:opacity-50"
    : "";

  const inputClass = immersiveChrome
    ? immersiveIsDark
      ? "min-h-[2.5rem] w-full resize-none rounded-xl border border-white/12 bg-neutral-900/55 px-3 py-2 text-sm leading-snug text-white placeholder:text-neutral-500 focus:border-bizzi-cyan/50 focus:outline-none focus:ring-2 focus:ring-bizzi-cyan/20 disabled:opacity-50"
      : "min-h-[2.5rem] w-full resize-none rounded-xl border border-neutral-200/95 bg-white px-3 py-2 text-sm leading-snug text-neutral-900 placeholder:text-neutral-500 focus:border-bizzi-blue/45 focus:outline-none focus:ring-2 focus:ring-bizzi-blue/15 disabled:opacity-50"
    : "min-h-[2.5rem] w-full resize-none rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm leading-snug text-neutral-900 placeholder-neutral-400 focus:border-bizzi-blue focus:outline-none focus:ring-1 focus:ring-bizzi-blue/20 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-white dark:placeholder-neutral-500 dark:focus:border-bizzi-cyan dark:focus:ring-bizzi-cyan/20";

  const photo = composerPhotoURL?.trim() || null;
  const showComposerAvatar = immersiveChrome && !!composerDisplayLabel.trim();
  const useVideoCommentShell = !!(immersiveChrome && immersiveVideoComment);
  const shadeStyleBlock = useVideoCommentShell && showComposerAvatar;

  const displayName = composerDisplayLabel.trim();
  const displaySec =
    pinnedVideoSec != null && Number.isFinite(pinnedVideoSec)
      ? pinnedVideoSec
      : (immersiveVideoComment?.livePlaybackSec ?? 0);

  const captureVideoTimestamp = () => {
    if (!immersiveVideoComment) return;
    const sec = immersiveVideoComment.pauseAndGetTimestamp();
    if (sec != null) setPinnedVideoSec(sec);
  };

  const accentHex = immersiveVideoComment?.badgeColorHex ?? "";

  const sendBtnClass = immersiveChrome
    ? immersiveIsDark
      ? "rounded-full shadow-md"
      : "rounded-full shadow-md"
    : "rounded-lg bg-bizzi-blue hover:bg-bizzi-blue/90 dark:rounded-lg dark:bg-bizzi-cyan dark:hover:bg-bizzi-cyan/90";

  const sendBtnStyle =
    useVideoCommentShell && accentHex ? ({ backgroundColor: accentHex } as CSSProperties) : undefined;

  const avatar = showComposerAvatar ? (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full ${
        shadeStyleBlock ? "h-11 w-11" : "h-10 w-10"
      } ${
        photo
          ? ""
          : immersiveIsDark
            ? "flex items-center justify-center bg-white/12 text-xs font-semibold text-white"
            : "flex items-center justify-center bg-neutral-200 text-xs font-semibold text-neutral-800"
      }`}
      aria-hidden
    >
      {photo ? (
        <Image
          src={photo}
          alt=""
          width={shadeStyleBlock ? 44 : 40}
          height={shadeStyleBlock ? 44 : 40}
          className={`object-cover ${shadeStyleBlock ? "h-11 w-11" : "h-10 w-10"}`}
          unoptimized
        />
      ) : (
        composerInitials(composerDisplayLabel)
      )}
    </div>
  ) : null;

  const badge = useVideoCommentShell ? (
    <span
      className="shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-semibold tabular-nums leading-none tracking-tight text-white sm:text-xs"
      style={{ backgroundColor: accentHex || "#64748b" }}
    >
      {formatVideoCommentTimecodeWithMs(displaySec)}
    </span>
  ) : null;

  const textArea = (
    <textarea
      ref={textareaRef}
      value={body}
      onChange={(e) => {
        setBody(e.target.value.slice(0, 2000));
        requestAnimationFrame(syncHeight);
      }}
      onKeyDown={handleKeyDown}
      onFocus={captureVideoTimestamp}
      placeholder={placeholder}
      rows={1}
      disabled={submitting}
      className={useVideoCommentShell ? textareaInShellClass : inputClass}
      style={{ maxHeight: MAX_HEIGHT_PX }}
    />
  );

  const sendButton = (
    <button
      type="button"
      onMouseDown={(e) => {
        if (e.button === 0) e.preventDefault();
      }}
      onClick={handleSubmit}
      disabled={!body.trim() || submitting}
      style={sendBtnStyle}
      className={`flex h-11 w-11 shrink-0 items-center justify-center text-white transition-opacity disabled:opacity-50 ${
        useVideoCommentShell && accentHex ? "hover:brightness-110" : ""
      } ${sendBtnClass}`}
      aria-label="Send comment"
    >
      <Send className="h-4 w-4" />
    </button>
  );

  if (shadeStyleBlock) {
    return (
      <div className="flex gap-3">
        {avatar}
        <div
          className={
            immersiveIsDark
              ? "flex min-w-0 flex-1 flex-col gap-3 rounded-2xl border border-white/12 bg-white/[0.06] p-4 shadow-lg shadow-black/25"
              : "flex min-w-0 flex-1 flex-col gap-3 rounded-2xl border border-neutral-200/95 bg-white p-4 shadow-md shadow-neutral-900/5"
          }
        >
          <div
            className={
              immersiveIsDark
                ? "truncate text-[15px] font-bold leading-tight tracking-tight text-white"
                : "truncate text-[15px] font-bold leading-tight tracking-tight text-neutral-900"
            }
          >
            {displayName}
          </div>
          <div className="flex items-center gap-2.5">
            <div className={`${shellRowClass} min-w-0 flex-1`}>
              {badge}
              {textArea}
            </div>
            {sendButton}
          </div>
          {showCancel && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="self-start text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

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
      {useVideoCommentShell ? (
        <div className={`${shellRowClass} flex-1`}>
          {badge}
          {textArea}
        </div>
      ) : (
        textArea
      )}
      <div className="flex shrink-0 flex-col gap-1 pb-0.5">
        {sendButton}
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
