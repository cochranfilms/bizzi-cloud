"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTransfers } from "@/context/TransferContext";
import { File, Eye, Download, Lock, Trash2 } from "lucide-react";
import Link from "next/link";
import { useConfirm } from "@/hooks/useConfirm";
import DashboardRouteFade from "./DashboardRouteFade";

interface TransferAnalyticsProps {
  transferId: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function TransferAnalytics({ transferId }: TransferAnalyticsProps) {
  const { transfers, deleteTransfer, updateTransferPermission } = useTransfers();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const transfer = transfers.find((t) => t.id === transferId);
  const { confirm } = useConfirm();

  const transfersBase =
    pathname?.startsWith("/desktop") ? "/desktop/app" : pathname?.startsWith("/enterprise") ? "/enterprise" : "/dashboard";

  const handleDelete = useCallback(async () => {
    if (!transfer) return;
    const ok = await confirm({
      message: `Delete transfer "${transfer.name}"? This cannot be undone.`,
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteTransfer(transfer.slug);
      router.push(`${transfersBase}/transfers`);
    } catch (err) {
      console.error("Delete transfer failed:", err);
    } finally {
      setDeleting(false);
    }
  }, [transfer, deleteTransfer, confirm, router, transfersBase]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const totalViews = transfer?.files.reduce((a, f) => a + f.views, 0) ?? 0;
  const totalDownloads = transfer?.files.reduce((a, f) => a + f.downloads, 0) ?? 0;

  return (
    <DashboardRouteFade ready={mounted} srOnlyMessage="Loading transfer">
    {!transfer ? (
      <div className="mx-auto max-w-2xl text-center py-16">
        <p className="text-neutral-600 dark:text-neutral-400">
          Transfer not found.
        </p>
        <Link
          href={`${transfersBase}/transfers`}
          className="mt-4 inline-block text-bizzi-blue hover:text-bizzi-cyan"
        >
          Back to transfers
        </Link>
      </div>
    ) : (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
          {transfer.name}
        </h1>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">
          Client: {transfer.clientName}
          {transfer.clientEmail && ` · ${transfer.clientEmail}`}
        </p>
        <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-500">
          Created {formatDate(transfer.createdAt)}
          {transfer.hasPassword && (
            <span className="ml-2 inline-flex items-center gap-1">
              <Lock className="h-3 w-3" /> Password protected
            </span>
          )}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">Permission:</span>
          <select
            value={transfer.permission ?? "downloadable"}
            onChange={(e) =>
              updateTransferPermission(
                transfer.slug,
                e.target.value as "view" | "downloadable"
              )
            }
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
            aria-label="Permission"
          >
            <option value="view">View only</option>
            <option value="downloadable">Downloadable</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20">
              <Eye className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Total views
              </p>
              <p className="text-2xl font-semibold text-neutral-900 dark:text-white">
                {totalViews}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20">
              <Download className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Total downloads
              </p>
              <p className="text-2xl font-semibold text-neutral-900 dark:text-white">
                {totalDownloads}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
          Per-file analytics
        </h2>
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-700">
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                  File
                </th>
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                  Views
                </th>
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                  Downloads
                </th>
              </tr>
            </thead>
            <tbody>
              {transfer.files.map((f) => (
                <tr
                  key={f.id}
                  className="border-b border-neutral-100 last:border-0 dark:border-neutral-800"
                >
                  <td className="flex items-center gap-2 px-4 py-3">
                    <File className="h-4 w-4 text-neutral-400" />
                    <span className="font-medium text-neutral-900 dark:text-white">
                      {f.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    {f.views}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    {f.downloads}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`/t/${transfer.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          View as client
        </a>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          {deleting ? "Deleting…" : "Delete transfer"}
        </button>
      </div>
    </div>
    )}
    </DashboardRouteFade>
  );
}
