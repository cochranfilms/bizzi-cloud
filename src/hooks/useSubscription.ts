"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { getFirebaseAuth } from "@/lib/firebase/client";

export interface SubscriptionState {
  planId: string;
  addonIds: string[];
  storageAddonId: string | null;
  hasPortalAccess: boolean;
  hasGallerySuite: boolean;
  hasEditor: boolean;
  loading: boolean;
}

/**
 * Gallery Suite = gallery or fullframe addon
 * Editor (NLE) = editor or fullframe addon
 */
export function useSubscription(): SubscriptionState {
  const { user } = useAuth();
  const [planId, setPlanId] = useState("free");
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [storageAddonId, setStorageAddonId] = useState<string | null>(null);
  const [hasPortalAccess, setHasPortalAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setPlanId("free");
      setAddonIds([]);
      setStorageAddonId(null);
      setHasPortalAccess(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          plan_id?: string;
          addon_ids?: string[];
          storage_addon_id?: string | null;
          has_portal_access?: boolean;
        };
        setPlanId(data.plan_id ?? "free");
        setAddonIds(data.addon_ids ?? []);
        setStorageAddonId(data.storage_addon_id ?? null);
        setHasPortalAccess(data.has_portal_access ?? false);
      }
    } catch {
      setPlanId("free");
      setAddonIds([]);
      setStorageAddonId(null);
      setHasPortalAccess(false);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const hasGallerySuite =
    addonIds.includes("gallery") || addonIds.includes("fullframe");
  const hasEditor =
    addonIds.includes("editor") || addonIds.includes("fullframe");

  return {
    planId,
    addonIds,
    storageAddonId,
    hasPortalAccess,
    hasGallerySuite,
    hasEditor,
    loading,
  };
}
