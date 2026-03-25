"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { getFirebaseAuth } from "@/lib/firebase/client";

export interface TeamSeatCountsState {
  none: number;
  gallery: number;
  editor: number;
  fullframe: number;
}

export interface SubscriptionState {
  planId: string;
  addonIds: string[];
  storageAddonId: string | null;
  hasPortalAccess: boolean;
  hasGallerySuite: boolean;
  hasEditor: boolean;
  /** Personal team (not Organization): member’s owner uid when applicable */
  personalTeamOwnerId: string | null;
  personalTeamSeatAccess: string | null;
  teamSeatCounts: TeamSeatCountsState;
  loading: boolean;
}

interface SubscriptionContextValue extends SubscriptionState {
  refetch: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [planId, setPlanId] = useState("free");
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [storageAddonId, setStorageAddonId] = useState<string | null>(null);
  const [hasPortalAccess, setHasPortalAccess] = useState(false);
  const [personalTeamOwnerId, setPersonalTeamOwnerId] = useState<string | null>(null);
  const [personalTeamSeatAccess, setPersonalTeamSeatAccess] = useState<string | null>(null);
  const [teamSeatCounts, setTeamSeatCounts] = useState<TeamSeatCountsState>({
    none: 0,
    gallery: 0,
    editor: 0,
    fullframe: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setPlanId("free");
      setAddonIds([]);
      setStorageAddonId(null);
      setHasPortalAccess(false);
      setPersonalTeamOwnerId(null);
      setPersonalTeamSeatAccess(null);
      setTeamSeatCounts({ none: 0, gallery: 0, editor: 0, fullframe: 0 });
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
          team_seat_counts?: TeamSeatCountsState;
          personal_team_owner_id?: string | null;
          personal_team_seat_access?: string | null;
        };
        setPlanId(data.plan_id ?? "free");
        setAddonIds(data.addon_ids ?? []);
        setStorageAddonId(data.storage_addon_id ?? null);
        setHasPortalAccess(data.has_portal_access ?? false);
        setPersonalTeamOwnerId(data.personal_team_owner_id ?? null);
        setPersonalTeamSeatAccess(data.personal_team_seat_access ?? null);
        const t = data.team_seat_counts;
        setTeamSeatCounts(
          t && typeof t === "object"
            ? {
                none: typeof t.none === "number" ? t.none : 0,
                gallery: typeof t.gallery === "number" ? t.gallery : 0,
                editor: typeof t.editor === "number" ? t.editor : 0,
                fullframe: typeof t.fullframe === "number" ? t.fullframe : 0,
              }
            : { none: 0, gallery: 0, editor: 0, fullframe: 0 }
        );
      }
    } catch {
      setPlanId("free");
      setAddonIds([]);
      setStorageAddonId(null);
      setHasPortalAccess(false);
      setPersonalTeamOwnerId(null);
      setPersonalTeamSeatAccess(null);
      setTeamSeatCounts({ none: 0, gallery: 0, editor: 0, fullframe: 0 });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    const handler = () => fetchProfile();
    window.addEventListener("subscription-updated", handler);
    return () => window.removeEventListener("subscription-updated", handler);
  }, [fetchProfile]);

  const hasGallerySuite =
    addonIds.includes("gallery") ||
    addonIds.includes("fullframe") ||
    personalTeamSeatAccess === "gallery" ||
    personalTeamSeatAccess === "fullframe";
  const hasEditor =
    addonIds.includes("editor") ||
    addonIds.includes("fullframe") ||
    personalTeamSeatAccess === "editor" ||
    personalTeamSeatAccess === "fullframe";

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      planId,
      addonIds,
      storageAddonId,
      hasPortalAccess,
      hasGallerySuite,
      hasEditor,
      personalTeamOwnerId,
      personalTeamSeatAccess,
      teamSeatCounts,
      loading,
      refetch: fetchProfile,
    }),
    [
      planId,
      addonIds,
      storageAddonId,
      hasPortalAccess,
      hasGallerySuite,
      hasEditor,
      personalTeamOwnerId,
      personalTeamSeatAccess,
      teamSeatCounts,
      loading,
      fetchProfile,
    ]
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error("useSubscription must be used within SubscriptionProvider");
  }
  return ctx;
}
