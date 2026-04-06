"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { FolderOpen, Lock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import type { ShareFile } from "./SharePreviewModal";
import DashboardRouteFade from "@/components/dashboard/DashboardRouteFade";
import SharedFolderBrowser from "./SharedFolderBrowser";

export interface SharedFolderContentProps {
  token: string;
  /** When true, renders without outer padding (for dashboard) */
  embedded?: boolean;
  /** When provided, called with folder_name when data loads (for TopBar in dashboard) */
  onFolderNameLoaded?: (name: string) => void;
}

type SharePayload = {
  folder_name: string;
  permission: string;
  files: ShareFile[];
  workspace_delivery_status?: string;
  viewer_can_moderate_delivery?: boolean;
  is_viewer_share_owner?: boolean;
};

export default function SharedFolderContent({ token, embedded, onFolderNameLoaded }: SharedFolderContentProps) {
  const { user } = useAuth();
  const [data, setData] = useState<SharePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deliveryActionLoading, setDeliveryActionLoading] = useState(false);

  const fetchShare = useCallback(async () => {
    setError(null);
    setErrorCode(null);
    try {
      const headers: Record<string, string> = {};
      if (user) {
        const idToken = await user.getIdToken();
        headers.Authorization = `Bearer ${idToken}`;
      }
      const res = await fetch(`/api/shares/${encodeURIComponent(token)}`, { headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message ?? body.error ?? `Failed to load (${res.status})`);
        setErrorCode(body.error ?? null);
        return;
      }
      setData(body);
      if (body?.folder_name && onFolderNameLoaded) {
        onFolderNameLoaded(body.folder_name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token, user, onFolderNameLoaded]);

  useEffect(() => {
    fetchShare();
  }, [fetchShare]);

  const handleWorkspaceDelivery = useCallback(
    async (action: "approve" | "reject") => {
      if (!user) return;
      setDeliveryActionLoading(true);
      try {
        const idToken = await user.getIdToken();
        const res = await fetch(
          `/api/shares/${encodeURIComponent(token)}/workspace-delivery`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${idToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action }),
          }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body.error as string) ?? "Could not update share");
        }
        await fetchShare();
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setDeliveryActionLoading(false);
      }
    },
    [user, token, fetchShare]
  );

  const singleFileOriginalName = useMemo(() => {
    if (!data || data.files.length !== 1) return null;
    const n = data.files[0]!.name;
    return n && n !== data.folder_name ? n : null;
  }, [data]);

  const handleDownload = useCallback(
    async (file: ShareFile) => {
      setDownloadingId(file.id);
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (user) {
          const idToken = await user.getIdToken();
          headers.Authorization = `Bearer ${idToken}`;
        }
        const res = await fetch(`/api/shares/${encodeURIComponent(token)}/download`, {
          method: "POST",
          headers,
          body: JSON.stringify({ object_key: file.object_key, name: file.name }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? body.error ?? "Download failed");
        }
        const { url } = await res.json();
        const a = document.createElement("a");
        a.href = url.startsWith("/") ? `${window.location.origin}${url}` : url;
        a.download = file.name;
        a.rel = "noopener noreferrer";
        a.click();
      } catch (err) {
        console.error("Download error:", err);
      } finally {
        setDownloadingId(null);
      }
    },
    [token, user]
  );

  const getAuthToken = useCallback(async () => {
    return user ? user.getIdToken() : null;
  }, [user]);

  const isExpired = error?.toLowerCase().includes("expired");
  const isPrivateAuth = errorCode === "private_share_requires_auth";

  const canDownload = data != null && data.permission !== "view";
  const permissionLabel = canDownload ? "Download" : "View only";

  return (
    <DashboardRouteFade
      ready={!loading}
      srOnlyMessage="Loading shared folder"
      compact={embedded}
    >
    {error || !data ? (
      isPrivateAuth && !embedded ? (
        <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
          <div className="w-full max-w-sm space-y-6 rounded-xl border border-neutral-200 bg-white p-8 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20">
                <Lock className="h-7 w-7" />
              </div>
              <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">
                This folder is private
              </h1>
              <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
                {error ?? "Sign in to access if you have been invited."}
              </p>
            </div>
            <Link
              href={`/login?redirect=${encodeURIComponent(`/s/${token}`)}`}
              className="flex w-full items-center justify-center rounded-lg bg-bizzi-blue py-3 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
            >
              Sign in to access
            </Link>
          </div>
        </div>
      ) : (
      <div className={`flex flex-col items-center justify-center gap-4 ${embedded ? "py-16" : "min-h-[40vh] py-16"}`}>
        <FolderOpen className="h-16 w-16 text-neutral-300 dark:text-neutral-600" />
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
          {isExpired ? "Share expired" : "Share not found"}
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {error ?? "This share may have been removed."}
        </p>
        <Link
          href="/"
          className="rounded-lg bg-bizzi-blue px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
        >
          Back to home
        </Link>
      </div>
      )
    ) : (
    <div className={embedded ? "" : "space-y-6"}>
      {data.workspace_delivery_status === "pending" && data.viewer_can_moderate_delivery && (
        <div className="mb-4 rounded-xl border border-amber-500/50 bg-amber-50 p-4 dark:border-amber-700/60 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
            Someone outside your workspace shared “{data.folder_name}”. Approve to show it to your
            team in Shared, or deny to keep it admin-only.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={deliveryActionLoading}
              onClick={() => void handleWorkspaceDelivery("approve")}
              className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan disabled:opacity-50"
            >
              {deliveryActionLoading ? "…" : "Approve for workspace"}
            </button>
            <button
              type="button"
              disabled={deliveryActionLoading}
              onClick={() => void handleWorkspaceDelivery("reject")}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-white dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              Deny
            </button>
          </div>
        </div>
      )}
      {data.workspace_delivery_status === "pending" && data.is_viewer_share_owner && (
        <div className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-200">
          This share is waiting for a workspace admin to approve it before your team can see it in
          Shared.
        </div>
      )}
      {embedded && singleFileOriginalName ? (
        <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400">
          Original file:{" "}
          <span className="font-mono text-xs text-neutral-600 dark:text-neutral-300">
            {singleFileOriginalName}
          </span>
        </p>
      ) : null}
      {!embedded && (
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
            {data.folder_name}
          </h1>
          {singleFileOriginalName ? (
            <p className="mt-0.5 truncate text-sm text-neutral-500 dark:text-neutral-400">
              Original file: {singleFileOriginalName}
            </p>
          ) : null}
          <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
            <span>Shared with you · {data.files.length} {data.files.length === 1 ? "file" : "files"}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                canDownload
                  ? "bg-bizzi-blue/20 text-bizzi-blue dark:bg-bizzi-blue/30 dark:text-bizzi-cyan"
                  : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400"
              }`}
            >
              {permissionLabel}
            </span>
          </p>
        </div>
      )}

      {data.files.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white py-12 text-center dark:border-neutral-700 dark:bg-neutral-900">
          <FolderOpen className="mx-auto mb-4 h-12 w-12 text-neutral-300 dark:text-neutral-600" />
          <p className="text-neutral-500 dark:text-neutral-400">
            This folder is empty.
          </p>
        </div>
      ) : (
        <SharedFolderBrowser
          shareToken={token}
          rootLabel={data.folder_name}
          files={data.files}
          getAuthToken={user ? getAuthToken : undefined}
          canDownload={canDownload}
          onDownload={handleDownload}
          downloadingId={downloadingId}
          chrome="dashboard"
        />
      )}
    </div>
    )}
    </DashboardRouteFade>
  );
}
