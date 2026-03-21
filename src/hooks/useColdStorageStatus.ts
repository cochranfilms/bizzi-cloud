"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";

export interface ColdStorageStatus {
  hasColdStorage: boolean;
  sourceType?: string;
  expiresAt?: string | null;
  restoreUrl?: string | null;
  orgName?: string | null;
}

export function useColdStorageStatus() {
  const { user } = useAuth();
  const [data, setData] = useState<ColdStorageStatus>({ hasColdStorage: false });
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!user) {
      setData({ hasColdStorage: false });
      return;
    }
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/storage/cold-storage-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setData({ hasColdStorage: false });
        return;
      }
      const parsed = (await res.json()) as ColdStorageStatus;
      setData(parsed);
    } catch {
      setData({ hasColdStorage: false });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    hasColdStorage: data.hasColdStorage,
    sourceType: data.sourceType,
    expiresAt: data.expiresAt,
    restoreUrl: data.restoreUrl,
    orgName: data.orgName,
    loading,
    refetch: fetchStatus,
  };
}
