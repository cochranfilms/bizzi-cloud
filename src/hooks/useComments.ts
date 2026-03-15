"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getAuthToken } from "@/lib/auth-token";
import { usePageVisibility } from "@/hooks/usePageVisibility";
import type { Comment } from "@/types/collaboration";

const POLL_INTERVAL_MS = 30_000;

export function useComments(fileId: string | null) {
  const { user } = useAuth();
  const isVisible = usePageVisibility();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchComments = useCallback(async () => {
    if (!fileId || !user) {
      setComments([]);
      setLoading(false);
      return;
    }
    const token = await getAuthToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/files/${fileId}/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [fileId, user]);

  useEffect(() => {
    setLoading(true);
    fetchComments();
    if (!fileId || !isVisible) return;
    const interval = setInterval(fetchComments, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fileId, fetchComments, isVisible]);

  const addComment = useCallback(
    async (body: string, parentCommentId?: string | null) => {
      if (!fileId || !user) return null;
      const token = await getAuthToken(true);
      if (!token) return null;
      try {
        const res = await fetch(`/api/files/${fileId}/comments`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            body: body.trim(),
            parentCommentId: parentCommentId ?? null,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Failed to add comment");
        }
        const data = await res.json();
        const newComment: Comment = {
          id: data.id,
          fileId,
          parentCommentId: data.parentCommentId ?? null,
          authorUserId: data.authorUserId,
          body: data.body,
          isEdited: data.isEdited ?? false,
          isDeleted: data.isDeleted ?? false,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt ?? data.createdAt,
        };
        setComments((prev) => [...prev, newComment]);
        return newComment;
      } catch {
        return null;
      }
    },
    [fileId, user]
  );

  const editComment = useCallback(
    async (commentId: string, body: string) => {
      if (!fileId || !user) return false;
      const token = await getAuthToken(true);
      if (!token) return false;
      try {
        const res = await fetch(
          `/api/files/${fileId}/comments/${commentId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ body: body.trim() }),
          }
        );
        if (!res.ok) return false;
        const data = await res.json();
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId
              ? {
                  ...c,
                  body: data.body,
                  isEdited: true,
                  updatedAt: data.updatedAt ?? c.updatedAt,
                }
              : c
          )
        );
        return true;
      } catch {
        return false;
      }
    },
    [fileId, user]
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      if (!fileId || !user) return false;
      const token = await getAuthToken(true);
      if (!token) return false;
      try {
        const res = await fetch(
          `/api/files/${fileId}/comments/${commentId}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (!res.ok) return false;
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId
              ? { ...c, isDeleted: true, body: "[deleted]" }
              : c
          )
        );
        return true;
      } catch {
        return false;
      }
    },
    [fileId, user]
  );

  return {
    comments,
    loading,
    addComment,
    editComment,
    deleteComment,
    refresh: fetchComments,
  };
}
