"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { Comment } from "@/types/collaboration";

interface CommentItemProps {
  comment: Comment;
  isOwn?: boolean;
  onEdit: (commentId: string, body: string) => Promise<boolean>;
  onDelete: (commentId: string) => Promise<boolean>;
  onReply?: (parentCommentId: string, body: string) => Promise<unknown>;
  immersiveChrome?: boolean;
}

export default function CommentItem({
  comment,
  isOwn,
  onEdit,
  onDelete,
  onReply,
  immersiveChrome = false,
}: CommentItemProps) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [menuOpen, setMenuOpen] = useState(false);

  if (comment.isDeleted) {
    return (
      <div
        className={
          immersiveChrome
            ? "py-2 text-sm italic text-neutral-600 dark:text-neutral-300"
            : "py-2 text-sm italic text-neutral-500 dark:text-neutral-400"
        }
      >
        [deleted]
      </div>
    );
  }

  return (
    <div className="group relative py-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex gap-2">
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value.slice(0, 2000))}
                rows={2}
                className={
                  immersiveChrome
                    ? "min-h-[4rem] w-full resize-y rounded-lg border-2 border-neutral-800 bg-white px-3 py-2 text-sm text-neutral-950 focus:border-bizzi-blue focus:outline-none dark:border-white/45 dark:bg-neutral-950/55 dark:text-white"
                    : "min-h-[4rem] w-full resize-y rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:border-bizzi-blue focus:outline-none dark:border-neutral-700 dark:bg-neutral-800"
                }
              />
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await onEdit(comment.id, editBody.trim());
                    if (ok) setEditing(false);
                  }}
                  className="rounded-lg bg-bizzi-blue px-2 py-1 text-xs text-white"
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
                  ? "whitespace-pre-wrap break-words text-sm text-neutral-950 dark:text-white"
                  : "whitespace-pre-wrap break-words text-sm text-neutral-800 dark:text-neutral-200"
              }
            >
              {comment.body}
            </p>
          )}
          <p
            className={
              immersiveChrome
                ? "mt-0.5 text-xs text-neutral-700 dark:text-neutral-300"
                : "mt-0.5 text-xs text-neutral-500 dark:text-neutral-400"
            }
          >
            {isOwn ? "You" : "Author"}
            {comment.isEdited && " · Edited"}
          </p>
        </div>
        {isOwn && !editing && (
          <div className="relative">
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
