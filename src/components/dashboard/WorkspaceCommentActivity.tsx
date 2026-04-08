"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Loader2, MessageSquareText } from "lucide-react";
import Link from "next/link";

export interface CommentActivityItem {
  id: string;
  fileId: string;
  fileName: string;
  authorUserId: string;
  authorDisplayName: string | null;
  authorRoleSnapshot: string | null;
  bodyPreview: string;
  createdAt: string | null;
  workspace_type: string;
}

interface WorkspaceCommentActivityProps {
  apiPath: string;
  filesBasePath: string;
  title?: string;
}

export default function WorkspaceCommentActivity({
  apiPath,
  filesBasePath,
  title = "File comment activity",
}: WorkspaceCommentActivityProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<CommentActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    setItems(null);
    setHidden(false);
    try {
      const token = await user.getIdToken();
      const res = await fetch(apiPath, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 403) {
        setHidden(true);
        setItems([]);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data.error as string) || `Could not load (${res.status})`);
        setItems([]);
        return;
      }
      const data = await res.json();
      setItems((data.items ?? []) as CommentActivityItem[]);
    } catch {
      setError("Network error");
      setItems([]);
    }
  }, [user, apiPath]);

  useEffect(() => {
    load();
  }, [load]);

  if (hidden) return null;

  if (items === null && !error) {
    return (
      <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
          <MessageSquareText className="h-5 w-5 opacity-70" />
          {title}
        </h2>
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      </section>
    );
  }

  if (items?.length === 0 && !error) {
    return (
      <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
          <MessageSquareText className="h-5 w-5 opacity-70" />
          {title}
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No comments yet, or comments need a one-time data backfill. Older comments may not appear until migrated.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
        <MessageSquareText className="h-5 w-5 text-bizzi-blue dark:text-bizzi-cyan" />
        {title}
      </h2>
      <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
        Recent comments on files in this workspace. Click a file to open it in the immersive viewer with comments.
      </p>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                <th className="pb-2 pr-3 font-medium">When</th>
                <th className="pb-2 pr-3 font-medium">File</th>
                <th className="pb-2 pr-3 font-medium">Author</th>
                <th className="pb-2 font-medium">Comment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {(items ?? []).map((row) => (
                <tr key={row.id} className="align-top text-neutral-800 dark:text-neutral-200">
                  <td className="py-2 pr-3 whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
                    {row.createdAt
                      ? new Date(row.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <Link
                      href={`${filesBasePath}?preview=${encodeURIComponent(row.fileId)}`}
                      className="font-medium text-bizzi-blue hover:underline dark:text-bizzi-cyan"
                      title={`Open preview: ${row.fileName}`}
                    >
                      {row.fileName}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="font-medium">
                      {row.authorDisplayName?.trim() || row.authorUserId.slice(0, 8)}
                    </span>
                    {row.authorRoleSnapshot ? (
                      <span className="ml-1 text-[10px] uppercase text-neutral-500">
                        {row.authorRoleSnapshot.replace(/_/g, " ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 max-w-[14rem] text-neutral-600 dark:text-neutral-300">
                    <span className="line-clamp-2">{row.bodyPreview}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
