"use client";

import { useState } from "react";
import { useComments } from "@/hooks/useComments";
import { useAuth } from "@/context/AuthContext";
import AddCommentInput from "./AddCommentInput";
import CommentItem from "./CommentItem";
import type { Comment } from "@/types/collaboration";

interface FileCommentsPanelProps {
  fileId: string;
  className?: string;
  /** Readable text/borders on immersive file preview glass panels */
  immersiveChrome?: boolean;
}

function CommentReplyList({
  comments,
  parentId,
  currentUserId,
  onEdit,
  onDelete,
  immersiveChrome,
}: {
  comments: Comment[];
  parentId: string;
  currentUserId: string;
  onEdit: (id: string, body: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  immersiveChrome?: boolean;
}) {
  const replies = comments.filter((c) => c.parentCommentId === parentId);
  if (replies.length === 0) return null;
  return (
    <div
      className={
        immersiveChrome
          ? "ml-6 mt-2 border-l-2 border-neutral-700 pl-4 dark:border-white/35"
          : "ml-6 mt-2 border-l-2 border-neutral-200 pl-4 dark:border-neutral-700"
      }
    >
      {replies.map((r) => (
        <CommentItem
          key={r.id}
          comment={r}
          isOwn={r.authorUserId === currentUserId}
          onEdit={onEdit}
          onDelete={onDelete}
          immersiveChrome={immersiveChrome}
        />
      ))}
    </div>
  );
}

export default function FileCommentsPanel({
  fileId,
  className = "",
  immersiveChrome = false,
}: FileCommentsPanelProps) {
  const { user } = useAuth();
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const {
    comments,
    loading,
    error,
    addComment,
    editComment,
    deleteComment,
  } = useComments(fileId, { sortOrder });

  const topLevel = comments.filter((c) => !c.parentCommentId);
  const currentUserId = user?.uid ?? "";

  const handleAdd = async (body: string) => {
    const result = await addComment(body, null);
    return !!result;
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h3
          className={
            immersiveChrome
              ? "text-xs font-medium uppercase tracking-wide text-neutral-800 dark:text-neutral-200"
              : "text-sm font-medium text-neutral-700 dark:text-neutral-300"
          }
        >
          Comments
        </h3>
        {topLevel.length > 0 ? (
          <select
            id={`comment-sort-${fileId}`}
            aria-label="Sort comments"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value === "desc" ? "desc" : "asc")}
            className={
              immersiveChrome
                ? "max-w-[9.5rem] rounded-md border border-neutral-600/50 bg-white/90 px-2 py-1 text-[11px] text-neutral-900 dark:border-white/25 dark:bg-neutral-900/60 dark:text-neutral-200"
                : "max-w-[9.5rem] rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
            }
          >
            <option value="asc">Oldest first</option>
            <option value="desc">Newest first</option>
          </select>
        ) : null}
      </div>

      {user ? (
        <AddCommentInput
          onSubmit={handleAdd}
          placeholder="Add a comment…"
          autoFocus={false}
          immersiveChrome={immersiveChrome}
        />
      ) : (
        <p
          className={
            immersiveChrome
              ? "py-4 text-sm text-neutral-700 dark:text-neutral-300"
              : "py-4 text-sm text-neutral-500 dark:text-neutral-400"
          }
        >
          Sign in to add a comment.
        </p>
      )}

      <div className="min-h-[3rem]">
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}
        {loading ? (
          <p
            className={
              immersiveChrome
                ? "py-3 text-sm text-neutral-700 dark:text-neutral-300"
                : "py-3 text-sm text-neutral-500 dark:text-neutral-400"
            }
          >
            Loading comments…
          </p>
        ) : topLevel.length === 0 ? (
          <div
            className={
              immersiveChrome
                ? "rounded-lg border border-dashed border-neutral-700 py-5 text-center dark:border-white/40"
                : "rounded-lg border border-dashed border-neutral-200 py-5 text-center dark:border-neutral-700"
            }
          >
            <p
              className={
                immersiveChrome
                  ? "text-sm text-neutral-800 dark:text-neutral-200"
                  : "text-sm text-neutral-500 dark:text-neutral-400"
              }
            >
              No comments yet. Be the first to comment!
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {topLevel.map((c) => (
              <li key={c.id}>
                <CommentItem
                  comment={c}
                  isOwn={c.authorUserId === currentUserId}
                  onEdit={editComment}
                  onDelete={deleteComment}
                  immersiveChrome={immersiveChrome}
                />
                <CommentReplyList
                  comments={comments}
                  parentId={c.id}
                  currentUserId={currentUserId}
                  onEdit={editComment}
                  onDelete={deleteComment}
                  immersiveChrome={immersiveChrome}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
