"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirebaseFirestore, isFirebaseConfigured } from "@/lib/firebase/client";
import type { ProxyStatus } from "@/hooks/useCloudFiles";

/**
 * Live `backup_files.proxy_status` for a single row. Personal/team drive listings
 * often refresh via polling; this listener updates the UI as soon as Firestore changes.
 */
export function useBackupFileLiveProxyStatus(
  backupFileId: string | undefined,
  isVideo: boolean,
  fallback: ProxyStatus | null | undefined
): ProxyStatus | null | undefined {
  const [fromDoc, setFromDoc] = useState<ProxyStatus | null | undefined>(undefined);

  useEffect(() => {
    setFromDoc(undefined);
    if (!isFirebaseConfigured() || !backupFileId || !isVideo) return;
    const db = getFirebaseFirestore();
    const ref = doc(db, "backup_files", backupFileId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setFromDoc(null);
          return;
        }
        const ps = snap.data()?.proxy_status as ProxyStatus | null | undefined;
        setFromDoc(ps ?? null);
      },
      () => {
        /* Missing rules or transient error — keep showing fallback until a later success */
      }
    );
    return unsub;
  }, [backupFileId, isVideo]);

  if (fromDoc !== undefined) return fromDoc;
  return fallback;
}
