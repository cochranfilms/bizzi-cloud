"use client";

import { useState } from "react";
import { useComments } from "@/hooks/useComments";
import { useAuth } from "@/context/AuthContext";
import { useThemeResolved } from "@/context/ThemeContext";
import { useImmersiveVideoCommentOptional } from "@/context/ImmersiveVideoCommentContext";
import AddCommentInput from "./AddCommentInput";
import CommentItem from "./CommentItem";
import type { Comment, FileCommentVisibilityScope } from "@/types/collaboration";

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
  immersiveIsDark,
  videoTimestampBadgeHex,
}: {
  comments: Comment[];
  parentId: string;
  currentUserId: string;
  onEdit: (id: string, body: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  immersiveChrome?: boolean;
  immersiveIsDark?: boolean;
  videoTimestampBadgeHex?: string | null;
}) {
  const replies = comments.filter((c) => c.parentCommentId === parentId);
  if (replies.length === 0) return null;
  return (
    <div
      className={
        immersiveChrome
          ? immersiveIsDark
            ? "ml-6 mt-2 border-l-2 border-white/15 pl-4"
            : "ml-6 mt-2 border-l-2 border-neutral-200 pl-4"
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
          immersiveIsDark={immersiveIsDark}
          videoTimestampBadgeHex={videoTimestampBadgeHex}
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
  const theme = useThemeResolved();
  const immersiveIsDark = immersiveChrome && theme === "dark";
  const immersiveVideoComment = useImmersiveVideoCommentOptional();

  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const {
    comments,
    loading,
    error,
    visibilityOptions,
    addComment,
    editComment,
    deleteComment,
  } = useComments(fileId, { sortOrder });

  const topLevel = comments.filter((c) => !c.parentCommentId);
  const currentUserId = user?.uid ?? "";

  const handleAdd = async (
    body: string,
    videoTimestampSec?: number | null,
    visibilityScope?: FileCommentVisibilityScope | null
  ) => {
    const result = await addComment(
      body,
      null,
      videoTimestampSec ?? undefined,
      visibilityScope ?? undefined
    );
    return !!result;
  };

  const commentVideoBadgeHex = immersiveVideoComment?.badgeColorHex ?? null;

  return (
    <div className={`flex flex-col ${immersiveChrome ? "gap-4" : "gap-2"} ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h3
          className={
            immersiveChrome
              ? immersiveIsDark
                ? "text-[15px] font-bold tracking-tight text-white"
                : "text-[15px] font-bold tracking-tight text-neutral-900"
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
                ? immersiveIsDark
                  ? "max-w-[9.5rem] rounded-xl border border-white/12 bg-neutral-900/45 px-2 py-1 text-[11px] text-white/90 outline-none focus:border-white/25 focus:ring-1 focus:ring-bizzi-cyan/25"
                  : "max-w-[9.5rem] rounded-xl border border-neutral-200/90 bg-white px-2 py-1 text-[11px] text-neutral-900 outline-none focus:border-bizzi-blue/40 focus:ring-1 focus:ring-bizzi-blue/15"
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
          placeholder="Add comment..."
          autoFocus={false}
          immersiveChrome={immersiveChrome}
          immersiveIsDark={immersiveChrome ? immersiveIsDark : undefined}
          composerPhotoURL={user.photoURL ?? null}
          composerDisplayLabel={
            user.displayName?.trim() || user.email?.split("@")[0] || user.uid.slice(0, 8)
          }
          immersiveVideoComment={immersiveChrome ? immersiveVideoComment : null}
          visibilityOptions={visibilityOptions}
        />
      ) : (
        <p
          className={
            immersiveChrome
              ? immersiveIsDark
                ? "py-4 text-sm text-white/65"
                : "py-4 text-sm text-neutral-600"
              : "py-4 text-sm text-neutral-500 dark:text-neutral-400"
          }
        >
          Sign in to add a comment.
        </p>
      )}

      <div className="min-h-[3rem]">
        {error ? (
          <p
            className={
              immersiveChrome
                ? immersiveIsDark
                  ? "rounded-xl border border-red-400/35 bg-red-950/30 px-3 py-2 text-xs text-red-200"
                  : "rounded-xl border border-red-200/90 bg-red-50 px-3 py-2 text-xs text-red-800"
                : "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
            }
          >
            {error}
          </p>
        ) : null}
        {loading ? (
          <p
            className={
              immersiveChrome
                ? immersiveIsDark
                  ? "py-3 text-sm text-white/60"
                  : "py-3 text-sm text-neutral-500"
                : "py-3 text-sm text-neutral-500 dark:text-neutral-400"
            }
          >
            Loading comments…
          </p>
        ) : topLevel.length === 0 ? (
          <div
            className={
              immersiveChrome
                ? immersiveIsDark
                  ? "rounded-xl border border-white/10 bg-white/[0.06] px-4 py-6 text-center"
                  : "rounded-xl border border-neutral-200/90 bg-neutral-50 px-4 py-6 text-center"
                : "rounded-lg border border-dashed border-neutral-200 py-5 text-center dark:border-neutral-700"
            }
          >
            <p
              className={
                immersiveChrome
                  ? immersiveIsDark
                    ? "text-sm leading-relaxed text-white/75"
                    : "text-sm leading-relaxed text-neutral-600"
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
                  immersiveIsDark={immersiveChrome ? immersiveIsDark : undefined}
                  videoTimestampBadgeHex={commentVideoBadgeHex}
                />
                <CommentReplyList
                  comments={comments}
                  parentId={c.id}
                  currentUserId={currentUserId}
                  onEdit={editComment}
                  onDelete={deleteComment}
                  immersiveChrome={immersiveChrome}
                  immersiveIsDark={immersiveChrome ? immersiveIsDark : undefined}
                  videoTimestampBadgeHex={commentVideoBadgeHex}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
