"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  computeTeamRouteSeatEntitlements,
  type PersonalTeamMembershipRow,
} from "@/lib/subscription-team-route-entitlements";
import { coerceTeamSeatCounts } from "@/lib/team-seat-pricing";

export type { PersonalTeamMembershipRow };

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
  /** @deprecated Use personal_team_memberships; kept for gradual migration */
  personalTeamOwnerId: string | null;
  /** @deprecated Derive from membership matching current /team route */
  personalTeamSeatAccess: string | null;
  /** Seat memberships on other users' personal teams (canonical). */
  personalTeamMemberships: PersonalTeamMembershipRow[];
  /** `personal_teams/{uid}` exists (after server bootstrap). */
  ownsPersonalTeam: boolean;
  /** Mirrors server `getOwnedPersonalTeamShellState` for the signed-in user as owner. */
  teamShellExists: boolean;
  teamSeatsEnabled: boolean;
  teamSetupMode: boolean;
  teamSeatCounts: TeamSeatCountsState;
  loading: boolean;
}

interface SubscriptionContextValue extends SubscriptionState {
  refetch: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [planId, setPlanId] = useState("free");
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [storageAddonId, setStorageAddonId] = useState<string | null>(null);
  const [hasPortalAccess, setHasPortalAccess] = useState(false);
  const [personalTeamOwnerId, setPersonalTeamOwnerId] = useState<string | null>(null);
  const [personalTeamSeatAccess, setPersonalTeamSeatAccess] = useState<string | null>(null);
  const [personalTeamMemberships, setPersonalTeamMemberships] = useState<
    PersonalTeamMembershipRow[]
  >([]);
  const [ownsPersonalTeam, setOwnsPersonalTeam] = useState(false);
  const [teamShellExists, setTeamShellExists] = useState(false);
  const [teamSeatsEnabled, setTeamSeatsEnabled] = useState(false);
  const [teamSetupMode, setTeamSetupMode] = useState(false);
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
      setPersonalTeamMemberships([]);
      setOwnsPersonalTeam(false);
      setTeamShellExists(false);
      setTeamSeatsEnabled(false);
      setTeamSetupMode(false);
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
          personal_team_memberships?: PersonalTeamMembershipRow[];
          owns_personal_team?: boolean;
          team_shell_exists?: boolean;
          team_seats_enabled?: boolean;
          team_setup_mode?: boolean;
        };
        setPlanId(data.plan_id ?? "free");
        setAddonIds(data.addon_ids ?? []);
        setStorageAddonId(data.storage_addon_id ?? null);
        setHasPortalAccess(data.has_portal_access ?? false);
        setOwnsPersonalTeam(!!data.owns_personal_team);
        setTeamShellExists(!!data.team_shell_exists);
        setTeamSeatsEnabled(!!data.team_seats_enabled);
        setTeamSetupMode(!!data.team_setup_mode);
        const m = Array.isArray(data.personal_team_memberships)
          ? data.personal_team_memberships
          : [];
        setPersonalTeamMemberships(m);
        setPersonalTeamOwnerId(
          typeof data.personal_team_owner_id === "string" ? data.personal_team_owner_id : null
        );
        setPersonalTeamSeatAccess(
          typeof data.personal_team_seat_access === "string" ? data.personal_team_seat_access : null
        );
        const t = data.team_seat_counts;
        setTeamSeatCounts(
          t && typeof t === "object" && !Array.isArray(t)
            ? coerceTeamSeatCounts(t)
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
      setPersonalTeamMemberships([]);
      setOwnsPersonalTeam(false);
      setTeamShellExists(false);
      setTeamSeatsEnabled(false);
      setTeamSetupMode(false);
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

  const { hasGallerySuite, hasEditor } = computeTeamRouteSeatEntitlements({
    pathname,
    userUid: user?.uid ?? null,
    personalTeamMemberships,
    addonIds,
  });

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
      personalTeamMemberships,
      ownsPersonalTeam,
      teamShellExists,
      teamSeatsEnabled,
      teamSetupMode,
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
      personalTeamMemberships,
      ownsPersonalTeam,
      teamShellExists,
      teamSeatsEnabled,
      teamSetupMode,
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
