"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Send, Lock, ExternalLink, BarChart2, Trash2, Pencil, Link2, Check } from "lucide-react";
import { useTransfers } from "@/context/TransferContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useConfirm } from "@/hooks/useConfirm";
import EditTransferModal from "@/components/dashboard/EditTransferModal";
import DashboardRouteFade from "./DashboardRouteFade";
import type { Transfer } from "@/types/transfer";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatExpires(iso: string | null) {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d < new Date() ? "Expired" : formatDate(iso);
}

export default function TransferGrid() {
  const pathname = usePathname();
  const { org } = useEnterprise();
  const { transfers, deleteTransfer, updateTransferPermission } = useTransfers();
  const [filter, setFilter] = useState<"all" | "active" | "expired">("all");

  const isEnterprise = typeof pathname === "string" && pathname.startsWith("/enterprise");
  const orgId = org?.id ?? null;
  const teamOwnerFromPath =
    typeof pathname === "string" ? (/^\/team\/([^/]+)/.exec(pathname)?.[1]?.trim() ?? null) : null;

  const transfersNavBase =
    pathname?.startsWith("/desktop") ? "/desktop/app"
    : pathname?.startsWith("/enterprise") ? "/enterprise"
    : teamOwnerFromPath ? `/team/${teamOwnerFromPath}`
    : "/dashboard";

  const scopeTransfers = useMemo(() => {
    if (isEnterprise && orgId) {
      return transfers.filter((t) => (t.organizationId ?? null) === orgId);
    }
    if (teamOwnerFromPath) {
      return transfers.filter(
        (t) =>
          (t.personalTeamOwnerId ?? null) === teamOwnerFromPath &&
          !(t.organizationId ?? null)
      );
    }
    return transfers.filter(
      (t) => !(t.personalTeamOwnerId ?? null) && !(t.organizationId ?? null)
    );
  }, [transfers, isEnterprise, orgId, teamOwnerFromPath]);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null);
  const { confirm } = useConfirm();

  const handleDelete = useCallback(
    async (e: React.MouseEvent, t: { name: string; slug: string }) => {
      e.preventDefault();
      e.stopPropagation();
      const ok = await confirm({
        message: `Delete transfer "${t.name}"? This cannot be undone.`,
        destructive: true,
      });
      if (!ok) return;
      setDeletingSlug(t.slug);
      try {
        await deleteTransfer(t.slug);
      } catch (err) {
        console.error("Delete transfer failed:", err);
      } finally {
        setDeletingSlug(null);
      }
    },
    [deleteTransfer, confirm]
  );

  const handleCopyLink = useCallback((slug: string) => {
    const url = typeof window !== "undefined" ? `${window.location.origin}/t/${slug}` : `/t/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  }, []);

  const handlePermissionChange = useCallback(
    async (slug: string, permission: "view" | "downloadable") => {
      try {
        await updateTransferPermission(slug, permission);
      } catch (err) {
        console.error("Update permission failed:", err);
      }
    },
    [updateTransferPermission]
  );

  const filtered =
    filter === "all"
      ? scopeTransfers
      : scopeTransfers.filter((t) => {
          if (filter === "active")
            return t.status === "active" && (!t.expiresAt || new Date(t.expiresAt) >= new Date());
          if (filter === "expired")
            return t.status === "expired" || (t.expiresAt && new Date(t.expiresAt) < new Date());
          return true;
        });

  return (
    <DashboardRouteFade ready srOnlyMessage="Loading transfers">
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1 dark:border-neutral-700 dark:bg-neutral-800">
          {(["all", "active", "expired"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`capitalize rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-white"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 py-16 dark:border-neutral-700">
          <Send className="mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-600" />
          <p className="mb-1 text-lg font-medium text-neutral-700 dark:text-neutral-300">
            No transfers yet
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Create a transfer to share files with your clients.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-700">
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Name</th>
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Client</th>
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Files</th>
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Views</th>
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Downloads</th>
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Permission</th>
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Expires</th>
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const totalViews = t.files.reduce((a, f) => a + f.views, 0);
                const totalDownloads = t.files.reduce((a, f) => a + f.downloads, 0);
                return (
                  <tr
                    key={t.id}
                    className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-neutral-900 dark:text-white">
                          {t.name}
                        </span>
                        {t.hasPassword && (
                          <Lock className="h-3.5 w-3.5 text-neutral-400" aria-label="Password protected" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {t.clientName}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {t.files.length}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {totalViews}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {totalDownloads}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={t.permission ?? "downloadable"}
                        onChange={(e) =>
                          handlePermissionChange(t.slug, e.target.value as "view" | "downloadable")
                        }
                        className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                        aria-label="Permission"
                      >
                        <option value="view">View only</option>
                        <option value="downloadable">Downloadable</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {formatExpires(t.expiresAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`${transfersNavBase}/transfers/${t.id}`}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-bizzi-blue dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-bizzi-cyan"
                        >
                          <BarChart2 className="h-4 w-4" />
                          Analytics
                        </Link>
                        <a
                          href={`/t/${t.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-bizzi-blue dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-bizzi-cyan"
                        >
                          <ExternalLink className="h-4 w-4" />
                          View
                        </a>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCopyLink(t.slug);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-bizzi-blue dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-bizzi-cyan"
                          aria-label="Copy link"
                        >
                          {copiedSlug === t.slug ? (
                            <>
                              <Check className="h-4 w-4" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Link2 className="h-4 w-4" />
                              Copy Link
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingTransfer(t);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-bizzi-blue dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-bizzi-cyan"
                          aria-label="Edit transfer"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={(ev) => handleDelete(ev, t)}
                          disabled={deletingSlug === t.slug}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-neutral-600 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-neutral-400 dark:hover:bg-red-950/30 dark:hover:text-red-400 disabled:opacity-50"
                          aria-label="Delete transfer"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <EditTransferModal
        open={!!editingTransfer}
        onClose={() => setEditingTransfer(null)}
        transfer={editingTransfer}
      />
    </div>
    </DashboardRouteFade>
  );
}
