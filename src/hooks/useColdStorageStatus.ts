"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";

export interface ColdStorageStatus {
  hasColdStorage: boolean;
  containerType?: "consumer" | "organization" | "personal_team";
  recoveryRole?:
    | "consumer"
    | "org_admin"
    | "org_member"
    | "team_admin"
    | "team_member";
  canRestoreContainer?: boolean;
  sourceType?: string;
  expiresAt?: string | null;
  daysRemaining?: number | null;
  restoreUrl?: string | null;
  unpaidInvoiceUrl?: string | null;
  billingStatus?: string | null;
  orgName?: string | null;
  informationalMessage?: string | null;
  restoreRequirements?: { totalBytesUsed: number; requiredAddonIds: string[] };
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
    containerType: data.containerType,
    recoveryRole: data.recoveryRole,
    canRestoreContainer: data.canRestoreContainer,
    sourceType: data.sourceType,
    expiresAt: data.expiresAt,
    daysRemaining: data.daysRemaining,
    restoreUrl: data.restoreUrl,
    unpaidInvoiceUrl: data.unpaidInvoiceUrl,
    billingStatus: data.billingStatus,
    orgName: data.orgName,
    informationalMessage: data.informationalMessage,
    restoreRequirements: data.restoreRequirements,
    loading,
    refetch: fetchStatus,
  };
}
