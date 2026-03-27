"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { Comment } from "@/types/collaboration";

interface CommentItemProps {
  comment: Comment;
  isOwn?: boolean;
  onEdit: (commentId: string, body: string) => Promise<boolean>;
  onDelete: (commentId: string) => Promise<boolean>;
  immersiveChrome?: boolean;
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
}: CommentItemProps) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [menuOpen, setMenuOpen] = useState(false);

  const name = displayName(comment, isOwn);
  const timeLabel = formatCommentTime(comment.createdAt);
  const role = comment.authorRoleSnapshot;

  if (comment.isDeleted) {
    return (
      <div
        className={
          immersiveChrome
            ? "py-1.5 text-xs italic text-neutral-600 dark:text-neutral-400"
            : "py-1.5 text-xs italic text-neutral-500 dark:text-neutral-400"
        }
      >
        [deleted]
      </div>
    );
  }

  return (
    <div className="group relative rounded-lg py-2">
      <div className="flex gap-2.5">
        <div
          className={
            immersiveChrome
              ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[11px] font-semibold text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100"
              : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[11px] font-semibold text-neutral-800 dark:bg-neutral-600 dark:text-neutral-100"
          }
          aria-hidden
        >
          {initials(name === "You" ? comment.authorDisplayName || "You" : name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
            <span
              className={
                immersiveChrome
                  ? "text-sm font-medium text-neutral-900 dark:text-white"
                  : "text-sm font-medium text-neutral-900 dark:text-white"
              }
            >
              {name}
            </span>
            {role && name !== "You" ? (
              <span className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {role.replace(/_/g, " ")}
              </span>
            ) : null}
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">{timeLabel}</span>
            {comment.isEdited ? (
              <span className="text-[11px] text-neutral-400 dark:text-neutral-500">· edited</span>
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
                    ? "min-h-[3.5rem] w-full resize-y rounded-lg border border-neutral-700/90 bg-white px-2.5 py-2 text-sm text-neutral-950 focus:border-bizzi-blue focus:outline-none dark:border-white/35 dark:bg-neutral-950/55 dark:text-white"
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
                  className="text-xs text-neutral-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p
              className={
                immersiveChrome
                  ? "mt-1 whitespace-pre-wrap break-words text-sm leading-snug text-neutral-800 dark:text-neutral-200"
                  : "mt-1 whitespace-pre-wrap break-words text-sm leading-snug text-neutral-800 dark:text-neutral-200"
              }
            >
              {comment.body}
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
                  ? "rounded p-1 text-neutral-600 opacity-0 transition-opacity hover:bg-neutral-900/10 group-hover:opacity-100 dark:text-neutral-300 dark:hover:bg-white/10"
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
