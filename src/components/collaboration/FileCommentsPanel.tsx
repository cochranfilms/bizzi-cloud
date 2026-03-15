"use client";

import { useComments } from "@/hooks/useComments";
import { useAuth } from "@/context/AuthContext";
import AddCommentInput from "./AddCommentInput";
import CommentItem from "./CommentItem";
import type { Comment } from "@/types/collaboration";

interface FileCommentsPanelProps {
  fileId: string;
  className?: string;
}

function CommentReplyList({
  comments,
  parentId,
  currentUserId,
  onEdit,
  onDelete,
}: {
  comments: Comment[];
  parentId: string;
  currentUserId: string;
  onEdit: (id: string, body: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const replies = comments.filter((c) => c.parentCommentId === parentId);
  if (replies.length === 0) return null;
  return (
    <div className="ml-6 mt-2 border-l-2 border-neutral-200 pl-4 dark:border-neutral-700">
      {replies.map((r) => (
        <CommentItem
          key={r.id}
          comment={r}
          isOwn={r.authorUserId === currentUserId}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

export default function FileCommentsPanel({ fileId, className = "" }: FileCommentsPanelProps) {
  const { user } = useAuth();
  const {
    comments,
    loading,
    addComment,
    editComment,
    deleteComment,
  } = useComments(fileId);

  const topLevel = comments.filter((c) => !c.parentCommentId);
  const currentUserId = user?.uid ?? "";

  const handleAdd = async (body: string) => {
    const result = await addComment(body, null);
    return !!result;
  };

  return (
    <div className={`flex flex-col ${className}`}>
      <h3 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Comments
      </h3>

      {user ? (
        <AddCommentInput
          onSubmit={handleAdd}
          placeholder="Add a comment…"
          autoFocus={false}
        />
      ) : (
        <p className="py-4 text-sm text-neutral-500 dark:text-neutral-400">
          Sign in to add a comment.
        </p>
      )}

      <div className="mt-4 min-h-[4rem]">
        {loading ? (
          <p className="py-4 text-sm text-neutral-500 dark:text-neutral-400">
            Loading comments…
          </p>
        ) : topLevel.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-200 py-8 text-center dark:border-neutral-700">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
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
                />
                <CommentReplyList
                  comments={comments}
                  parentId={c.id}
                  currentUserId={currentUserId}
                  onEdit={editComment}
                  onDelete={deleteComment}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
