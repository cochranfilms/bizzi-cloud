"use client";

import { useState } from "react";
import Image from "next/image";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { Comment } from "@/types/collaboration";
import { useImmersiveVideoCommentOptional } from "@/context/ImmersiveVideoCommentContext";
import { formatVideoCommentTimecodeWithMs } from "@/lib/video-comment-timecode";

interface CommentItemProps {
  comment: Comment;
  isOwn?: boolean;
  onEdit: (commentId: string, body: string) => Promise<boolean>;
  onDelete: (commentId: string) => Promise<boolean>;
  immersiveChrome?: boolean;
  /** When `immersiveChrome`, set from parent. Defaults to false (light immersive). */
  immersiveIsDark?: boolean;
  /** Dashboard custom button / chrome primary; used for video timecode badge. */
  videoTimestampBadgeHex?: string | null;
}

function formatCommentTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diffMs = now - d.getTime();
  if (diffMs < 60_000) return "Just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function displayName(comment: Comment, isOwn: boolean): string {
  if (isOwn) return "You";
  return comment.authorDisplayName?.trim() || "Member";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

export default function CommentItem({
  comment,
  isOwn = false,
  onEdit,
  onDelete,
  immersiveChrome = false,
  immersiveIsDark = false,
  videoTimestampBadgeHex = null,
}: CommentItemProps) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [menuOpen, setMenuOpen] = useState(false);
  const immersiveVideoComment = useImmersiveVideoCommentOptional();

  const name = displayName(comment, isOwn);
  const timeLabel = formatCommentTime(comment.createdAt);
  const role = comment.authorRoleSnapshot;
  const avatarLabel = name === "You" ? comment.authorDisplayName || "You" : name;
  const photoUrl = comment.authorPhotoURL?.trim() || null;

  if (comment.isDeleted) {
    return (
      <div
        className={
          immersiveChrome
            ? immersiveIsDark
              ? "py-1.5 text-xs italic text-white/40"
              : "py-1.5 text-xs italic text-neutral-500"
            : "py-1.5 text-xs italic text-neutral-500 dark:text-neutral-400"
        }
      >
        [deleted]
      </div>
    );
  }

  const videoTs = comment.videoTimestampSec;
  const canSeekVideo =
    immersiveChrome &&
    videoTs != null &&
    Number.isFinite(videoTs) &&
    !!immersiveVideoComment;

  return (
    <div
      className={`group relative py-2 ${
        immersiveChrome
          ? immersiveIsDark
            ? "rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3 shadow-md shadow-black/20"
            : "rounded-2xl border border-neutral-200/90 bg-white px-3 py-3 shadow-sm"
          : "rounded-lg"
      }`}
    >
      <div className="flex gap-2.5">
        <div
          className={`relative h-8 w-8 shrink-0 overflow-hidden rounded-full ${
            photoUrl
              ? ""
              : immersiveChrome
                ? immersiveIsDark
                  ? "flex items-center justify-center bg-white/12 text-[11px] font-semibold text-white"
                  : "flex items-center justify-center bg-neutral-200 text-[11px] font-semibold text-neutral-800"
                : "flex items-center justify-center bg-neutral-200 text-[11px] font-semibold text-neutral-800 dark:bg-neutral-600 dark:text-neutral-100"
          }`}
          aria-hidden
        >
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 object-cover"
              unoptimized
            />
          ) : (
            initials(avatarLabel)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
            <span
              className={
                immersiveChrome
                  ? immersiveIsDark
                    ? "text-sm font-medium text-white"
                    : "text-sm font-medium text-neutral-900"
                  : "text-sm font-medium text-neutral-900 dark:text-white"
              }
            >
              {name}
            </span>
            {role && name !== "You" ? (
              <span
                className={
                  immersiveChrome
                    ? immersiveIsDark
                      ? "text-[10px] uppercase tracking-wide text-white/45"
                      : "text-[10px] uppercase tracking-wide text-neutral-500"
                    : "text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
                }
              >
                {role.replace(/_/g, " ")}
              </span>
            ) : null}
            <span
              className={
                immersiveChrome
                  ? immersiveIsDark
                    ? "text-[11px] text-white/50"
                    : "text-[11px] text-neutral-500"
                  : "text-[11px] text-neutral-500 dark:text-neutral-400"
              }
            >
              {timeLabel}
            </span>
            {comment.isEdited ? (
              <span
                className={
                  immersiveChrome
                    ? immersiveIsDark
                      ? "text-[11px] text-white/40"
                      : "text-[11px] text-neutral-400"
                    : "text-[11px] text-neutral-400 dark:text-neutral-500"
                }
              >
                · edited
              </span>
            ) : null}
          </div>
          {editing ? (
            <div className="mt-2 flex gap-2">
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value.slice(0, 2000))}
                rows={2}
                className={
                  immersiveChrome
                    ? immersiveIsDark
                      ? "min-h-[3.5rem] w-full resize-y rounded-xl border border-white/12 bg-neutral-900/55 px-2.5 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-bizzi-cyan/50 focus:outline-none focus:ring-2 focus:ring-bizzi-cyan/20"
                      : "min-h-[3.5rem] w-full resize-y rounded-xl border border-neutral-200/95 bg-white px-2.5 py-2 text-sm text-neutral-900 focus:border-bizzi-blue/45 focus:outline-none focus:ring-2 focus:ring-bizzi-blue/15"
                    : "min-h-[3.5rem] w-full resize-y rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-sm focus:border-bizzi-blue focus:outline-none dark:border-neutral-700 dark:bg-neutral-800"
                }
              />
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await onEdit(comment.id, editBody.trim());
                    if (ok) setEditing(false);
                  }}
                  className="rounded-md bg-bizzi-blue px-2 py-1 text-xs text-white dark:bg-bizzi-cyan"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditBody(comment.body);
                    setEditing(false);
                  }}
                  className={
                    immersiveChrome
                      ? immersiveIsDark
                        ? "text-xs text-white/55 hover:text-white/80"
                        : "text-xs text-neutral-500 hover:text-neutral-700"
                      : "text-xs text-neutral-500"
                  }
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p
              className={
                immersiveChrome
                  ? immersiveIsDark
                    ? "mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 whitespace-pre-wrap break-words text-sm leading-snug text-white/88"
                    : "mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 whitespace-pre-wrap break-words text-sm leading-snug text-neutral-800"
                  : "mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 whitespace-pre-wrap break-words text-sm leading-snug text-neutral-800 dark:text-neutral-200"
              }
            >
              {videoTs != null && Number.isFinite(videoTs) ? (
                canSeekVideo ? (
                  <button
                    type="button"
                    onClick={() => immersiveVideoComment?.seekToSeconds(videoTs)}
                    className="inline-flex shrink-0 cursor-pointer rounded-full px-2 py-1 text-[11px] font-semibold tabular-nums text-white transition-[filter] hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-neutral-900/35 dark:focus-visible:ring-white/45 dark:focus-visible:ring-offset-0"
                    style={{
                      backgroundColor: videoTimestampBadgeHex?.trim() || "#64748b",
                    }}
                    title="Jump to this time in the video"
                  >
                    {formatVideoCommentTimecodeWithMs(videoTs)}
                  </button>
                ) : (
                  <span
                    className="inline-flex shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold tabular-nums text-white"
                    style={{
                      backgroundColor: videoTimestampBadgeHex?.trim() || "#64748b",
                    }}
                  >
                    {formatVideoCommentTimecodeWithMs(videoTs)}
                  </span>
                )
              ) : null}
              <span className="min-w-0">{comment.body}</span>
            </p>
          )}
        </div>
        {isOwn && !editing && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className={
                immersiveChrome
                  ? immersiveIsDark
                    ? "rounded-lg p-1 text-white/65 opacity-0 transition-opacity hover:bg-white/10 group-hover:opacity-100"
                    : "rounded-lg p-1 text-neutral-500 opacity-0 transition-opacity hover:bg-neutral-100 group-hover:opacity-100"
                  : "rounded p-1 text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-100 group-hover:opacity-100 dark:hover:bg-neutral-800"
              }
              aria-label="Comment options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                  aria-hidden
                />
                <div className="absolute right-0 top-full z-20 mt-1 min-w-[120px] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(true);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await onDelete(comment.id);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
