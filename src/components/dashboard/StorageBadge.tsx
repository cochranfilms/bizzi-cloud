"use client";

import { useCallback, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useBackup } from "@/context/BackupContext";
import { useAuth } from "@/context/AuthContext";
import { getFirebaseAuth, getFirebaseFirestore, isFirebaseConfigured } from "@/lib/firebase/client";
import { formatBytes } from "@/lib/analytics/format-bytes";
import { FREE_TIER_STORAGE_BYTES } from "@/lib/plan-constants";

export default function StorageBadge() {
  const [storageUsed, setStorageUsed] = useState(0);
  const [storageQuota, setStorageQuota] = useState(FREE_TIER_STORAGE_BYTES);
  const [recalculating, setRecalculating] = useState(false);
  const { storageVersion } = useBackup();
  const { user } = useAuth();

  useEffect(() => {
    if (!isFirebaseConfigured() || !user) return;
    const db = getFirebaseFirestore();
    getDoc(doc(db, "profiles", user.uid)).then(async (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setStorageUsed(d.storage_used_bytes ?? 0);
        setStorageQuota(d.storage_quota_bytes ?? FREE_TIER_STORAGE_BYTES);
      } else {
        // New free user: ensure profile exists with 2GB quota
        try {
          const token = await getFirebaseAuth().currentUser?.getIdToken();
          const base = typeof window !== "undefined" ? window.location.origin : "";
          await fetch(`${base}/api/profile/ensure-free`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch {
          // Ignore - display will still show 2GB default
        }
      }
    });
  }, [user, storageVersion]);

  const recalculateStorage = useCallback(async () => {
    if (!isFirebaseConfigured() || !user) return;
    setRecalculating(true);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken(true);
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/storage/recalculate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { storage_used_bytes: number };
      setStorageUsed(data.storage_used_bytes);
    } catch (err) {
      console.error("Recalculate storage:", err);
    } finally {
      setRecalculating(false);
    }
  }, [user]);

  return (
    <div className="mb-3 rounded-lg bg-neutral-100 px-3 py-2 dark:bg-neutral-800">
      <p className="text-xs text-neutral-600 dark:text-neutral-400">
        Your storage
      </p>
      <p className="text-sm font-medium text-neutral-900 dark:text-white">
        {formatBytes(storageUsed)} of {formatBytes(storageQuota)} used
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
