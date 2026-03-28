"use client";

import { useCallback, useEffect, useState } from "react";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useAuth } from "@/context/AuthContext";
import { formatBytes } from "@/lib/analytics/format-bytes";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";

type OrgStoragePayload = {
  workspace_used_bytes?: number;
  billable_used_bytes?: number;
  reserved_bytes?: number;
  effective_billable_bytes_for_enforcement?: number;
  quota_bytes?: number | null;
  _deprecated?: { storage_used_bytes?: number; storage_quota_bytes?: number | null };
};

export default function EnterpriseStorageBadge() {
  const { refetch } = useEnterprise();
  const { user } = useAuth();
  const [billableUsed, setBillableUsed] = useState(0);
  const [quota, setQuota] = useState<number | null>(1024 * 1024 * 1024 * 1024);
  const [reserved, setReserved] = useState(0);
  const [recalculating, setRecalculating] = useState(false);

  const fetchMyStorage = useCallback(async () => {
    if (!isFirebaseConfigured() || !user) return;
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken(true);
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/enterprise/my-storage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as OrgStoragePayload;
      const bill =
        typeof data.billable_used_bytes === "number"
          ? data.billable_used_bytes
          : (data._deprecated?.storage_used_bytes ?? 0);
      const q = data.quota_bytes ?? data._deprecated?.storage_quota_bytes ?? null;
      setBillableUsed(bill);
      setQuota(q);
      setReserved(typeof data.reserved_bytes === "number" ? data.reserved_bytes : 0);
    } catch (err) {
      console.error("Fetch my storage:", err);
    }
  }, [user]);

  useEffect(() => {
    fetchMyStorage();
  }, [fetchMyStorage]);

  const recalculateStorage = useCallback(async () => {
    if (!isFirebaseConfigured() || !user) return;
    setRecalculating(true);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken(true);
      const base = typeof window !== "undefined" ? window.location.origin : "";
      await fetch(`${base}/api/storage/recalculate-org`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchMyStorage();
      await refetch();
    } catch (err) {
      console.error("Recalculate storage:", err);
    } finally {
      setRecalculating(false);
    }
  }, [user, refetch, fetchMyStorage]);

  const quotaLabel = quota === null ? "Unlimited" : formatBytes(quota);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col rounded-lg bg-neutral-100 px-3 py-3 dark:bg-neutral-800">
      <p className="text-xs text-neutral-600 dark:text-neutral-400">Organization storage (shared pool)</p>
      <p className="text-sm font-medium text-neutral-900 dark:text-white">
        {formatBytes(billableUsed)} of {quotaLabel} used
        {reserved > 0 ? (
          <span className="font-normal text-neutral-500 dark:text-neutral-400">
            {" "}
            (+{formatBytes(reserved)} in-flight)
          </span>
        ) : null}
      </p>
      <details className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        <summary className="cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-300">
          Details
        </summary>
        <ul className="mt-1.5 list-inside list-disc space-y-0.5 pl-0.5">
          <li>Org billable (files): {formatBytes(billableUsed)}</li>
          <li>Reserved: {formatBytes(reserved)}</li>
          <li>Enforcement total: {formatBytes(billableUsed + reserved)}</li>
          <li className="pt-1 text-neutral-500">
            Per-seat allocations (if set) cap your uploads separately—see Seats &amp; invites.
          </li>
        </ul>
      </details>
      <div className="mt-auto pt-3">
        <button
          type="button"
          onClick={recalculateStorage}
          disabled={recalculating}
          className="text-xs text-neutral-500 underline hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300 disabled:opacity-50"
        >
          {recalculating ? "Updating…" : "Refresh storage"}
        </button>
      </div>
    </div>
  );
}
