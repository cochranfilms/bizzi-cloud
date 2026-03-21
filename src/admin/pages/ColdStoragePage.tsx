"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "../components/shared/PageHeader";
import { Archive, Loader2, RotateCcw, Eye, CalendarPlus, Copy, ExternalLink } from "lucide-react";

interface ColdStorageFolder {
  folder: string;
  ownerType: string;
  sourceType: string;
  planTier: string;
  fileCount: number;
  totalBytes: number;
  coldStorageStartedAt: string | null;
  expiresAt: string | null;
  orgId: string | null;
  orgName: string | null;
  userId: string | null;
  fileIds: string[];
}

interface ColdStorageFile {
  id: string;
  relative_path: string;
  object_key: string;
  size_bytes: number;
  cold_storage_expires_at: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(1)} TB`;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function ColdStoragePage() {
  const { user } = useAuth();
  const [folders, setFolders] = useState<ColdStorageFolder[]>([]);
  const [totalFiles, setTotalFiles] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const [folderFiles, setFolderFiles] = useState<ColdStorageFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [restoringOrgId, setRestoringOrgId] = useState<string | null>(null);
  const [restoringUserId, setRestoringUserId] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<{
    hosted_invoice_url?: string;
    checkout_url?: string;
    org_name?: string;
    user_email?: string;
  } | null>(null);
  const [extendingFolder, setExtendingFolder] = useState<string | null>(null);

  const fetchColdStorage = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (sourceFilter) params.set("sourceType", sourceFilter);
      const res = await fetch(
        `/api/admin/cold-storage?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch");
      setFolders(data.folders ?? []);
      setTotalFiles(data.totalFiles ?? 0);
      setTotalBytes(data.totalBytes ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user, sourceFilter]);

  useEffect(() => {
    fetchColdStorage();
  }, [fetchColdStorage]);

  const fetchFolderFiles = useCallback(
    async (folder: ColdStorageFolder) => {
      if (!user) return;
      setLoadingFiles(true);
      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams();
        if (folder.orgId) params.set("orgId", folder.orgId);
        else if (folder.userId) params.set("userId", folder.userId);
        else params.set("folder", folder.folder);
        const res = await fetch(
          `/api/admin/cold-storage/files?${params.toString()}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        setFolderFiles(data.files ?? []);
      } finally {
        setLoadingFiles(false);
      }
    },
    [user]
  );

  const handleExpandFolder = (folder: ColdStorageFolder) => {
    const key = folder.orgId ?? folder.folder;
    if (expandedFolder === key) {
      setExpandedFolder(null);
      setFolderFiles([]);
    } else {
      setExpandedFolder(key);
      fetchFolderFiles(folder);
    }
  };

  const handleRestoreOrg = async (orgId: string) => {
    if (!user) return;
    setRestoringOrgId(orgId);
    setRestoreResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/cold-storage/restore-org", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orgId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to restore");
      setRestoreResult({
        hosted_invoice_url: data.hosted_invoice_url,
        org_name: data.org_name,
      });
      fetchColdStorage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setRestoringOrgId(null);
    }
  };

  const handleRestoreConsumer = async (userId: string) => {
    if (!user) return;
    setRestoringUserId(userId);
    setRestoreResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/cold-storage/restore-consumer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to restore");
      setRestoreResult({
        checkout_url: data.checkout_url,
        user_email: data.user_email,
      });
      fetchColdStorage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setRestoringUserId(null);
    }
  };

  const handleExtendRetention = async (folder: ColdStorageFolder) => {
    if (!user) return;
    const key = folder.orgId ?? folder.folder;
    setExtendingFolder(key);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/cold-storage/extend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          folder.orgId ? { orgId: folder.orgId, days: 30 } : { folder: folder.folder, days: 30 }
        ),
      });
      if (!res.ok) throw new Error("Failed to extend");
      await fetchColdStorage();
      if (expandedFolder === key) {
        fetchFolderFiles(folder);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extend failed");
    } finally {
      setExtendingFolder(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cold Storage"
        subtitle="Files in cold storage awaiting restoration or permanent deletion"
        actions={
          <button
            type="button"
            onClick={() => fetchColdStorage()}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium dark:border-neutral-700 dark:bg-neutral-800"
          >
            Refresh
          </button>
        }
      />

      {restoreResult && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
          <p className="font-medium text-green-900 dark:text-green-100">
            Restore initiated for {restoreResult.org_name ?? restoreResult.user_email}
          </p>
          <p className="mt-1 text-sm text-green-800 dark:text-green-200">
            {restoreResult.hosted_invoice_url
              ? "Owner must pay the invoice to complete restore. Copy the payment link and send to the owner."
              : "User must complete checkout to restore. Send the checkout link to the user."}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={restoreResult.hosted_invoice_url ?? restoreResult.checkout_url ?? ""}
              className="flex-1 rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
            />
            <button
              type="button"
              onClick={() => copyToClipboard(restoreResult.hosted_invoice_url ?? restoreResult.checkout_url ?? "")}
              className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
            >
              <Copy className="h-4 w-4" />
              Copy
            </button>
            <a
              href={restoreResult.hosted_invoice_url ?? restoreResult.checkout_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg bg-bizzi-blue px-2 py-1.5 text-sm font-medium text-white"
            >
              <ExternalLink className="h-4 w-4" />
              Open
            </a>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-4 rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Total folders
          </p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-white">
            {folders.length}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Total files
          </p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-white">
            {totalFiles.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Total size
          </p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-white">
            {formatBytes(totalBytes)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Filter by source:
        </label>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        >
          <option value="">All</option>
          <option value="org_removal">Org removal</option>
          <option value="subscription_end">Subscription end</option>
          <option value="account_delete">Account delete</option>
          <option value="payment_failed">Payment failed</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading cold storage…</span>
        </div>
      ) : folders.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center dark:border-neutral-700 dark:bg-neutral-900">
          <Archive className="mx-auto h-12 w-12 text-neutral-400" />
          <p className="mt-4 text-neutral-600 dark:text-neutral-400">
            No cold storage data
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
          <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Folder
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Owner
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Source
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Files
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Size
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Expires
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Days left
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {folders.map((folder) => {
                const key = folder.orgId ? `org:${folder.orgId}` : `user:${folder.userId ?? folder.folder}`;
                const isExpanded = expandedFolder === key;
                const isOrg = folder.ownerType === "organization" || folder.orgId;
                const isOrgRemoval = folder.sourceType === "org_removal";
                const daysRemaining = folder.expiresAt
                  ? Math.max(0, Math.ceil((new Date(folder.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
                  : null;
                return (
                  <React.Fragment key={key}>
                    <tr className="bg-white dark:bg-neutral-900">
                      <td className="px-6 py-3 text-sm text-neutral-900 dark:text-white">
                        {folder.folder}
                        {folder.orgName && (
                          <span className="ml-2 text-neutral-500 dark:text-neutral-400">
                            ({folder.orgName})
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            isOrg
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                          }`}
                        >
                          {isOrg ? "Organization" : "Consumer"}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
                          {folder.sourceType}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                        {folder.fileCount.toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                        {formatBytes(folder.totalBytes)}
                      </td>
                      <td className="px-6 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                        {folder.expiresAt
                          ? new Date(folder.expiresAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-6 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                        {daysRemaining != null ? String(daysRemaining) : "—"}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleExpandFolder(folder)}
                            className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-600"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            {isExpanded ? "Hide" : "View"} files
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExtendRetention(folder)}
                            disabled={extendingFolder === key}
                            className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-600 disabled:opacity-50"
                          >
                            {extendingFolder === key ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CalendarPlus className="h-3.5 w-3.5" />
                            )}
                            Extend +30d
                          </button>
                          {isOrgRemoval && folder.orgId && (
                            <button
                              type="button"
                              onClick={() => handleRestoreOrg(folder.orgId!)}
                              disabled={restoringOrgId === folder.orgId}
                              className="flex items-center gap-1 rounded-lg bg-bizzi-blue px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                            >
                              {restoringOrgId === folder.orgId ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                              Restore Organization
                            </button>
                          )}
                          {!isOrg && folder.userId && (
                            <button
                              type="button"
                              onClick={() => handleRestoreConsumer(folder.userId!)}
                              disabled={restoringUserId === folder.userId}
                              className="flex items-center gap-1 rounded-lg bg-bizzi-blue px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                            >
                              {restoringUserId === folder.userId ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                              Restore Consumer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="bg-neutral-50 px-6 py-4 dark:bg-neutral-800/50">
                          {loadingFiles ? (
                            <div className="flex items-center gap-2 text-sm text-neutral-500">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading files…
                            </div>
                          ) : (
                            <div className="max-h-60 overflow-y-auto">
                              <table className="min-w-full text-sm">
                                <thead>
                                  <tr>
                                    <th className="text-left font-medium">Path</th>
                                    <th className="text-right">Size</th>
                                    <th className="text-right">Expires</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {folderFiles.map((f) => (
                                    <tr key={f.id}>
                                      <td className="font-mono text-xs">{f.relative_path}</td>
                                      <td className="text-right">
                                        {formatBytes(f.size_bytes)}
                                      </td>
                                      <td className="text-right">
                                        {f.cold_storage_expires_at
                                          ? new Date(f.cold_storage_expires_at).toLocaleDateString()
                                          : "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
