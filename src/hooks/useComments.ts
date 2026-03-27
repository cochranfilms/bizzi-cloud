"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getAuthToken } from "@/lib/auth-token";
import { usePageVisibility } from "@/hooks/usePageVisibility";
import type { Comment } from "@/types/collaboration";

const POLL_INTERVAL_MS = 30_000;

export interface UseCommentsOptions {
  sortOrder?: "asc" | "desc";
}

function mapCommentFromApi(raw: Record<string, unknown>, fileId: string): Comment {
  return {
    id: raw.id as string,
    fileId: (raw.fileId as string) ?? fileId,
    parentCommentId: (raw.parentCommentId ?? null) as string | null,
    authorUserId: raw.authorUserId as string,
    authorDisplayName: (raw.authorDisplayName ?? null) as string | null,
    authorEmail: (raw.authorEmail ?? null) as string | null,
    authorRoleSnapshot: (raw.authorRoleSnapshot ?? null) as string | null,
    workspace_type: (raw.workspace_type ?? null) as Comment["workspace_type"],
    workspace_id: (raw.workspace_id ?? null) as string | null,
    visibility_scope: (raw.visibility_scope ?? null) as Comment["visibility_scope"],
    body: (raw.body as string) ?? "",
    isEdited: !!(raw.isEdited ?? false),
    isDeleted: !!(raw.isDeleted ?? false),
    createdAt: (raw.createdAt as string) ?? "",
    updatedAt: (raw.updatedAt as string) ?? (raw.createdAt as string) ?? "",
  };
}

export function useComments(fileId: string | null, options: UseCommentsOptions = {}) {
  const { sortOrder = "asc" } = options;
  const { user } = useAuth();
  const isVisible = usePageVisibility();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    if (!fileId || !user) {
      setComments([]);
      setLoading(false);
      setError(null);
      return;
    }
    const token = await getAuthToken();
    if (!token) {
      setError("Sign in to load comments.");
      setLoading(false);
      return;
    }
    try {
      const orderParam = sortOrder === "desc" ? "desc" : "asc";
      const res = await fetch(`/api/files/${fileId}/comments?order=${orderParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data.error as string) || `Could not load comments (${res.status})`);
        setComments([]);
        return;
      }
      const data = await res.json();
      const rawList = (data.comments ?? []) as Record<string, unknown>[];
      setComments(rawList.map((r) => mapCommentFromApi(r, fileId)));
      setError(null);
    } catch {
      setError("Network error loading comments.");
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [fileId, user, sortOrder]);

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
          setError((err.error as string) || "Failed to add comment");
          return null;
        }
        const data = await res.json();
        const newComment = mapCommentFromApi(data as Record<string, unknown>, fileId);
        setComments((prev) => [...prev, newComment]);
        setError(null);
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
        const res = await fetch(`/api/files/${fileId}/comments/${commentId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ body: body.trim() }),
        });
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
        const res = await fetch(`/api/files/${fileId}/comments/${commentId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return false;
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId ? { ...c, isDeleted: true, body: "[deleted]" } : c
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
    error,
    addComment,
    editComment,
    deleteComment,
    refresh: fetchComments,
  };
}
