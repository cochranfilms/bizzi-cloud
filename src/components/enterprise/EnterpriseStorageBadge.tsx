"use client";

import { useCallback, useEffect, useState } from "react";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useAuth } from "@/context/AuthContext";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024)
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function EnterpriseStorageBadge() {
  const { refetch } = useEnterprise();
  const { user } = useAuth();
  const [storageUsed, setStorageUsed] = useState(0);
  const [storageQuota, setStorageQuota] = useState<number | null>(
    1024 * 1024 * 1024 * 1024
  );
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
      const data = (await res.json()) as {
        storage_used_bytes: number;
        storage_quota_bytes: number | null;
      };
      setStorageUsed(data.storage_used_bytes ?? 0);
      setStorageQuota(data.storage_quota_bytes ?? null);
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

  const quotaLabel =
    storageQuota === null ? "Unlimited" : formatBytes(storageQuota);

  return (
    <div className="mb-3 rounded-lg bg-neutral-100 px-3 py-2 dark:bg-neutral-800">
      <p className="text-xs text-neutral-600 dark:text-neutral-400">
        Your storage
      </p>
      <p className="text-sm font-medium text-neutral-900 dark:text-white">
        {formatBytes(storageUsed)} of {quotaLabel} used
      </p>
      <button
        type="button"
        onClick={recalculateStorage}
        disabled={recalculating}
        className="mt-1.5 text-xs text-neutral-500 underline hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300 disabled:opacity-50"
      >
        {recalculating ? "Updating…" : "Refresh storage"}
      </button>
    </div>
  );
}
