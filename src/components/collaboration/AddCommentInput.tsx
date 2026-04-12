"use client";

import { useState, useRef, useEffect, useCallback, type CSSProperties } from "react";
import Image from "next/image";
import { ArrowUp, CircleSlash, Globe, Paperclip, Timer } from "lucide-react";
import type { ImmersiveVideoCommentContextValue } from "@/context/ImmersiveVideoCommentContext";
import type { FileCommentVisibilityScope } from "@/types/collaboration";
import { formatVideoCommentTimecodeWithMs } from "@/lib/video-comment-timecode";

const MAX_HEIGHT_PX = 128;
const MIN_HEIGHT_PX = 40;
/** Shade-style chip / send (avoid enterprise red on timecode). */
const SHADE_CHIP_BG = "#7c3aed";
const SHADE_SEND_BG = "#8b5cf6";

interface AddCommentInputProps {
  onSubmit: (
    body: string,
    videoTimestampSec?: number | null,
    visibilityScope?: FileCommentVisibilityScope | null
  ) => Promise<boolean>;
  placeholder?: string;
  onCancel?: () => void;
  showCancel?: boolean;
  autoFocus?: boolean;
  immersiveChrome?: boolean;
  immersiveIsDark?: boolean;
  composerPhotoURL?: string | null;
  composerDisplayLabel?: string;
  immersiveVideoComment?: ImmersiveVideoCommentContextValue | null;
  /** From GET /api/files/.../comment-composer; when empty, visibility is omitted on POST. */
  visibilityOptions?: { value: FileCommentVisibilityScope; label: string }[];
}

function composerInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return label.slice(0, 2).toUpperCase() || "?";
}

export default function AddCommentInput({
  onSubmit,
  placeholder = "Add comment...",
  onCancel,
  showCancel = false,
  autoFocus = false,
  immersiveChrome = false,
  immersiveIsDark = false,
  composerPhotoURL,
  composerDisplayLabel = "",
  immersiveVideoComment = null,
  visibilityOptions = [],
}: AddCommentInputProps) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pinnedVideoSec, setPinnedVideoSec] = useState<number | null>(null);
  const [visibilityScope, setVisibilityScope] = useState<FileCommentVisibilityScope | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const useVideoTools = !!(immersiveChrome && immersiveVideoComment);

  useEffect(() => {
    if (visibilityOptions.length === 0) {
      setVisibilityScope(null);
      return;
    }
    setVisibilityScope((prev) => {
      if (prev && visibilityOptions.some((o) => o.value === prev)) return prev;
      return visibilityOptions[0]!.value;
    });
  }, [visibilityOptions]);

  const syncHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const cap = immersiveChrome ? Math.min(100, MAX_HEIGHT_PX) : MAX_HEIGHT_PX;
    const next = Math.min(cap, Math.max(MIN_HEIGHT_PX, el.scrollHeight));
    el.style.height = `${next}px`;
  }, [immersiveChrome]);

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
    const vis =
      visibilityOptions.length > 0 && visibilityScope != null ? visibilityScope : null;
    const ok = await onSubmit(trimmed, ts, vis);
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
      void handleSubmit();
    }
  };

  const capturePinnedFromPlayhead = () => {
    if (!immersiveVideoComment) return;
    const sec = immersiveVideoComment.pauseAndGetTimestamp();
    if (sec != null) setPinnedVideoSec(sec);
  };

  const clearPinnedTimestamp = () => setPinnedVideoSec(null);

  const displaySec =
    pinnedVideoSec != null && Number.isFinite(pinnedVideoSec)
      ? pinnedVideoSec
      : (immersiveVideoComment?.livePlaybackSec ?? 0);

  const photo = composerPhotoURL?.trim() || null;
  const showComposerAvatar = immersiveChrome && !!composerDisplayLabel.trim();
  const displayName = composerDisplayLabel.trim();

  const focusTextarea = () => textareaRef.current?.focus();

  const inputRowShell = immersiveIsDark
    ? "rounded-xl border border-white/14 bg-white/[0.08] shadow-inner shadow-black/20"
    : "rounded-xl border border-neutral-200/95 bg-neutral-50/90 shadow-sm";

  const textareaBase =
    "min-h-[2.5rem] w-full min-w-0 flex-1 resize-none border-0 bg-transparent px-0 py-1 text-[15px] leading-snug focus:outline-none focus:ring-0 disabled:opacity-50";

  const textareaClassName = immersiveChrome
    ? immersiveIsDark
      ? `${textareaBase} text-white placeholder:text-neutral-400`
      : `${textareaBase} text-neutral-900 placeholder:text-neutral-500`
    : "min-h-[2.5rem] w-full resize-none rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm leading-snug text-neutral-900 placeholder-neutral-400 focus:border-bizzi-blue focus:outline-none focus:ring-1 focus:ring-bizzi-blue/20 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-white dark:placeholder-neutral-500 dark:focus:border-bizzi-cyan dark:focus:ring-bizzi-cyan/20";

  const textArea = (
    <textarea
      ref={textareaRef}
      value={body}
      onChange={(e) => {
        setBody(e.target.value.slice(0, 2000));
        requestAnimationFrame(syncHeight);
      }}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      rows={immersiveChrome ? 2 : 1}
      disabled={submitting}
      autoComplete="off"
      className={textareaClassName}
      style={immersiveChrome ? { maxHeight: 100 } : { maxHeight: MAX_HEIGHT_PX }}
    />
  );

  const sendButtonStyle: CSSProperties = immersiveChrome
    ? { backgroundColor: SHADE_SEND_BG }
    : {};

  const sendButton = (
    <button
      type="button"
      onMouseDown={(e) => {
        if (e.button === 0) e.preventDefault();
      }}
      onClick={() => void handleSubmit()}
      disabled={!body.trim() || submitting}
      style={sendButtonStyle}
      className={`flex h-9 w-9 shrink-0 items-center justify-center text-white shadow-sm transition-opacity disabled:opacity-50 ${
        immersiveChrome
          ? "rounded-full hover:brightness-105"
          : "rounded-lg bg-bizzi-blue hover:bg-bizzi-blue/90 dark:bg-bizzi-cyan dark:hover:bg-bizzi-cyan/90"
      }`}
      aria-label="Send comment"
    >
      <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
    </button>
  );

  const visibilityControl =
    visibilityOptions.length > 0 ? (
      <div
        className={`flex min-w-0 items-center gap-1.5 ${
          immersiveIsDark ? "text-white/85" : "text-neutral-700"
        }`}
      >
        <Globe
          className="h-3.5 w-3.5 shrink-0 opacity-70"
          style={{ color: immersiveIsDark ? "#c4b5fd" : SHADE_CHIP_BG }}
          aria-hidden
        />
        <select
          aria-label="Comment visibility"
          value={visibilityScope ?? visibilityOptions[0]!.value}
          disabled={visibilityOptions.length <= 1 || submitting}
          onChange={(e) =>
            setVisibilityScope(e.target.value as FileCommentVisibilityScope)
          }
          className={
            immersiveIsDark
              ? "max-w-[10.5rem] cursor-pointer truncate rounded-lg border border-white/12 bg-neutral-900/50 py-1 pl-1.5 pr-6 text-[11px] text-white/90 outline-none focus:border-white/25 sm:max-w-[12rem] sm:text-xs"
              : "max-w-[10.5rem] cursor-pointer truncate rounded-lg border border-neutral-200/90 bg-white py-1 pl-1.5 pr-6 text-[11px] text-neutral-800 outline-none focus:border-violet-400 sm:max-w-[12rem] sm:text-xs"
          }
        >
          {visibilityOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    ) : null;

  const avatar = showComposerAvatar ? (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full ${
        immersiveChrome ? "h-9 w-9" : "h-9 w-9"
      } ${
        photo
          ? ""
          : immersiveIsDark
            ? "flex items-center justify-center bg-white/12 text-[11px] font-semibold text-white"
            : "flex items-center justify-center bg-teal-600 text-[11px] font-semibold text-white"
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
  ) : null;

  /** Immersive / file-preview composer: Shade-style compact card. */
  if (immersiveChrome) {
    return (
      <div className="pointer-events-auto relative z-10 flex gap-2.5 sm:gap-3">
        {avatar}
        <div
          className={`flex min-w-0 flex-1 flex-col gap-2 rounded-2xl p-3 sm:p-3.5 ${
            immersiveIsDark
              ? "border border-white/12 bg-white/[0.06] shadow-lg shadow-black/30"
              : "border border-neutral-200/90 bg-white shadow-md shadow-neutral-900/[0.06]"
          }`}
        >
          <div
            className={
              immersiveIsDark
                ? "truncate text-sm font-semibold text-white"
                : "truncate text-sm font-semibold text-neutral-900"
            }
          >
            {displayName}
          </div>

          <div
            className={`relative flex min-h-[2.75rem] w-full min-w-0 items-start gap-2 px-2.5 py-1.5 ${inputRowShell}`}
            onPointerDown={(e) => {
              const t = e.target as HTMLElement;
              if (t.closest("button")) return;
              if (t.closest("textarea")) return;
              e.preventDefault();
              focusTextarea();
            }}
          >
            {useVideoTools ? (
              <button
                type="button"
                onClick={capturePinnedFromPlayhead}
                className="mt-1.5 shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold tabular-nums leading-none text-white sm:text-[11px]"
                style={{ backgroundColor: SHADE_CHIP_BG }}
                title="Current playhead time"
              >
                {formatVideoCommentTimecodeWithMs(displaySec)}
              </button>
            ) : null}
            {textArea}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-0.5">
              {useVideoTools ? (
                <>
                  <button
                    type="button"
                    onClick={capturePinnedFromPlayhead}
                    className={`rounded-lg p-1.5 transition-colors ${
                      immersiveIsDark
                        ? "text-violet-300 hover:bg-white/10"
                        : "text-violet-700 hover:bg-violet-50"
                    }`}
                    title="Capture time from video"
                    aria-label="Insert timestamp from playhead"
                  >
                    <Timer className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={clearPinnedTimestamp}
                    disabled={pinnedVideoSec == null}
                    className={`rounded-lg p-1.5 transition-colors disabled:opacity-35 ${
                      immersiveIsDark
                        ? "text-violet-300 hover:bg-white/10"
                        : "text-violet-700 hover:bg-violet-50"
                    }`}
                    title="Clear pinned time"
                    aria-label="Clear pinned timestamp"
                  >
                    <CircleSlash className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </>
              ) : null}
              <button
                type="button"
                disabled
                className={`cursor-not-allowed rounded-lg p-1.5 opacity-45 ${
                  immersiveIsDark ? "text-violet-300" : "text-violet-700"
                }`}
                title="Attachments coming soon"
                aria-label="Attachments unavailable"
              >
                <Paperclip className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {visibilityControl}
              {sendButton}
            </div>
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
      <div className="min-w-0 flex-1">{textArea}</div>
      <div className="flex shrink-0 flex-col items-end gap-1 pb-0.5">
        {visibilityOptions.length > 0 ? (
          <div className="mb-0.5">{visibilityControl}</div>
        ) : null}
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
