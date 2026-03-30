"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useBackup } from "@/context/BackupContext";
import { useAuth } from "@/context/AuthContext";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import type { CategoryAggregate } from "@/lib/analytics/aggregate";

export interface StorageAnalyticsData {
  totalUsedBytes: number;
  totalQuotaBytes: number | null;
  remainingBytes: number;
  totalFileCount: number;
  lastUpdated: string;
  categories: CategoryAggregate[];
  activeBytes: number;
  archivedBytes: number;
  /** @deprecated Use trashedBytes */
  trashBytes: number;
  trashedBytes: number;
  pendingPurgeBytes: number;
  deleteFailedBytes: number;
  sharedBytes: number;
  versionBytes: number;
  largestFiles: Array<{
    id: string;
    name: string;
    size: number;
    category: string;
  }>;
  largestFileType?: string | null;
  fastestGrowingCategory?: string;
  oldFiles90DaysCount?: number;
  compressionOpportunities?: number;
  uploadBytesThisMonth?: number;
  uploadBytesLastMonth?: number;
  monthlyUploads?: Array<{ month: string; bytes: number }>;
}

export function useStorageAnalytics() {
  const { user } = useAuth();
  const { storageVersion } = useBackup();
  const pathname = usePathname();
  const isEnterprise = typeof pathname === "string" && pathname.startsWith("/enterprise");

  const [data, setData] = useState<StorageAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const context = isEnterprise ? "enterprise" : "personal";

  const fetchAnalytics = useCallback(async () => {
    if (!isFirebaseConfigured() || !user) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken(true);
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(
        `${base}/api/storage/analytics?context=${context}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as StorageAnalyticsData & {
        lastUpdated?: string;
        largestFileType?: string | null;
        trashedBytes?: number;
        pendingPurgeBytes?: number;
        deleteFailedBytes?: number;
      };
      const trashedBytes = json.trashedBytes ?? json.trashBytes ?? 0;
      setData({
        ...json,
        trashedBytes,
        trashBytes: json.trashBytes ?? trashedBytes,
        pendingPurgeBytes: json.pendingPurgeBytes ?? 0,
        deleteFailedBytes: json.deleteFailedBytes ?? 0,
        lastUpdated: json.lastUpdated ?? new Date().toISOString(),
        largestFileType: json.largestFileType ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user, context]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics, storageVersion]);

  return { data, loading, error, refetch: fetchAnalytics };
}
