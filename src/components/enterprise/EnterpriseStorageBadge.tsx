"use client";

import { useCallback, useEffect, useState } from "react";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useAuth } from "@/context/AuthContext";
import { formatBytes } from "@/lib/analytics/format-bytes";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";

type SeatPayload = {
  quota_mode?: string;
  storage_quota_bytes?: number | null;
  used_bytes?: number;
  reserved_bytes?: number;
  effective_bytes?: number;
  remaining_bytes?: number | null;
  unlimited_within_org_pool?: boolean;
  state?: string;
};

type OrgStoragePayload = {
  workspace_used_bytes?: number;
  billable_used_bytes?: number;
  reserved_bytes?: number;
  effective_billable_bytes_for_enforcement?: number;
  quota_bytes?: number | null;
  org_pool_state?: string;
  seat?: SeatPayload;
  _deprecated?: { storage_used_bytes?: number; storage_quota_bytes?: number | null };
};

export default function EnterpriseStorageBadge() {
  const { refetch } = useEnterprise();
  const { user } = useAuth();
  const [billableUsed, setBillableUsed] = useState(0);
  const [quota, setQuota] = useState<number | null>(1024 * 1024 * 1024 * 1024);
  const [reserved, setReserved] = useState(0);
  const [seat, setSeat] = useState<SeatPayload | null>(null);
  const [orgPoolState, setOrgPoolState] = useState<string | null>(null);
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
      setSeat(data.seat ?? null);
      setOrgPoolState(typeof data.org_pool_state === "string" ? data.org_pool_state : null);
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
  const seatCapLabel =
    seat?.unlimited_within_org_pool || seat?.storage_quota_bytes == null
      ? "Unlimited (org pool)"
      : formatBytes(seat.storage_quota_bytes as number);
  const seatUsed = typeof seat?.used_bytes === "number" ? seat.used_bytes : 0;
  const seatRem =
    typeof seat?.remaining_bytes === "number" ? formatBytes(seat.remaining_bytes) : null;

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
      {orgPoolState === "over_pool" ? (
        <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
          Org pool is over capacity — new uploads are blocked until space is freed.
        </p>
      ) : null}

      {seat ? (
        <div className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-600">
          <p className="text-xs text-neutral-600 dark:text-neutral-400">Your seat</p>
          <p className="text-sm font-medium text-neutral-900 dark:text-white">
            {formatBytes(seatUsed)} of {seatCapLabel} used
            {seatRem ? (
              <span className="font-normal text-neutral-500 dark:text-neutral-400">
                {" "}
                ({seatRem} remaining)
              </span>
            ) : null}
          </p>
          {seat.state === "over_quota" ? (
            <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
              Seat allocation exceeded — new uploads are blocked until space is freed or an admin raises
              your cap.
            </p>
          ) : null}
        </div>
      ) : null}

      <details className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        <summary className="cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-300">
          Details
        </summary>
        <ul className="mt-1.5 list-inside list-disc space-y-0.5 pl-0.5">
          <li>Org billable (files): {formatBytes(billableUsed)}</li>
          <li>Reserved: {formatBytes(reserved)}</li>
          <li>Enforcement total: {formatBytes(billableUsed + reserved)}</li>
          <li className="pt-1 text-neutral-500">
            &quot;Unlimited&quot; for a seat means unlimited within the organization pool—not infinite
            storage.
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
