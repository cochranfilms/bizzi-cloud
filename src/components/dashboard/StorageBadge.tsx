"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useBackup } from "@/context/BackupContext";
import { useAuth } from "@/context/AuthContext";
import { getFirebaseFirestore, isFirebaseConfigured } from "@/lib/firebase/client";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024)
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function StorageBadge() {
  const [storageUsed, setStorageUsed] = useState(0);
  const [storageQuota, setStorageQuota] = useState(50 * 1024 * 1024 * 1024);
  const { storageVersion } = useBackup();
  const { user } = useAuth();

  useEffect(() => {
    if (!isFirebaseConfigured() || !user) return;
    const db = getFirebaseFirestore();
    getDoc(doc(db, "profiles", user.uid)).then((snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setStorageUsed(d.storage_used_bytes ?? 0);
        setStorageQuota(d.storage_quota_bytes ?? 50 * 1024 * 1024 * 1024);
      }
    });
  }, [user, storageVersion]);

  return (
    <div className="mb-3 rounded-lg bg-neutral-100 px-3 py-2 dark:bg-neutral-800">
      <p className="text-xs text-neutral-600 dark:text-neutral-400">
        Your storage
      </p>
      <p className="text-sm font-medium text-neutral-900 dark:text-white">
        {formatBytes(storageUsed)} of {formatBytes(storageQuota)} used
      </p>
    </div>
  );
}
