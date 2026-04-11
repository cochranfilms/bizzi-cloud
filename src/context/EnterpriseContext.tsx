"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { getFirebaseFirestore } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import type { Organization, OrganizationRole } from "@/types/enterprise";

export interface EnterpriseContextValue {
  organization: Organization | null;
  org: Organization | null;
  role: OrganizationRole | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const EnterpriseContext = createContext<EnterpriseContextValue | null>(null);

function parseOrgFromFirestore(
  id: string,
  data: FirebaseFirestore.DocumentData
): Organization {
  const created_at = data.created_at?.toDate?.();
  const addonIds = Array.isArray(data.addon_ids)
    ? (data.addon_ids as string[])
    : [];
  return {
    id,
    name: data.name ?? "",
    logo_url: data.logo_url ?? null,
    theme: (data.theme as Organization["theme"]) ?? "bizzi",
    storage_quota_bytes: data.storage_quota_bytes ?? 0,
    storage_used_bytes: data.storage_used_bytes ?? 0,
    numeric_allocated_seat_bytes:
      typeof data.numeric_allocated_seat_bytes === "number"
        ? data.numeric_allocated_seat_bytes
        : undefined,
    active_seat_count:
      typeof data.active_seat_count === "number" ? data.active_seat_count : undefined,
    fixed_quota_seat_count:
      typeof data.fixed_quota_seat_count === "number" ? data.fixed_quota_seat_count : undefined,
    unlimited_seat_count:
      typeof data.unlimited_seat_count === "number" ? data.unlimited_seat_count : undefined,
    max_seats: data.max_seats ?? null,
    addon_ids: addonIds.length > 0 ? addonIds : undefined,
    stripe_subscription_id:
      typeof data.stripe_subscription_id === "string" ? data.stripe_subscription_id : null,
    created_at: created_at ? created_at.toISOString() : "",
    created_by: data.created_by ?? "",
  };
}

export function EnterpriseProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [role, setRole] = useState<OrganizationRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrg = useCallback(async () => {
    if (!user) {
      setOrganization(null);
      setRole(null);
      // Keep loading=true so EnterpriseAuthGuard doesn't redirect prematurely while auth resolves
      setLoading(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const db = getFirebaseFirestore();
      let storedOrgId: string | null = null;
      if (typeof window !== "undefined") {
        try {
          storedOrgId = sessionStorage.getItem("bizzi-enterprise-org");
        } catch {
          // ignore
        }
      }

      const seatsQuery = query(
        collection(db, "organization_seats"),
        where("user_id", "==", user.uid),
        where("status", "==", "active"),
        limit(20)
      );
      const profileRef = doc(db, "profiles", user.uid);
      const [seatsSnap, profileSnap] = await Promise.all([
        getDocs(seatsQuery),
        getDoc(profileRef),
      ]);
      const seatOrgIds = [
        ...new Set(
          seatsSnap.docs
            .map((d) => d.data().organization_id as string)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        ),
      ];
      const profileData = profileSnap.data();
      const profileOrgId = profileData?.organization_id as string | undefined;

      let chosenOrgId: string | null = null;
      if (storedOrgId && seatOrgIds.includes(storedOrgId)) {
        chosenOrgId = storedOrgId;
      } else if (profileOrgId && seatOrgIds.includes(profileOrgId)) {
        chosenOrgId = profileOrgId;
      } else if (seatOrgIds.length > 0) {
        chosenOrgId = seatOrgIds[0];
      }

      if (!chosenOrgId) {
        setOrganization(null);
        setRole(null);
        setLoading(false);
        if (typeof window !== "undefined") {
          try {
            sessionStorage.removeItem("bizzi-enterprise-org");
          } catch {
            // ignore
          }
        }
        return;
      }

      const seatDocId = `${chosenOrgId}_${user.uid}`;
      const seatRef = doc(db, "organization_seats", seatDocId);
      const orgRef = doc(db, "organizations", chosenOrgId);
      const [seatSnap, orgSnap] = await Promise.all([
        getDoc(seatRef),
        getDoc(orgRef),
      ]);
      const roleFromSeat =
        (seatSnap.data()?.role as OrganizationRole | undefined) ?? "member";

      if (!orgSnap.exists()) {
        setOrganization(null);
        setRole(null);
        setLoading(false);
        return;
      }

      const org = parseOrgFromFirestore(orgSnap.id, orgSnap.data()!);
      setOrganization(org);
      setRole(
        profileOrgId === chosenOrgId
          ? ((profileData?.organization_role as OrganizationRole | undefined) ?? roleFromSeat)
          : roleFromSeat
      );
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem("bizzi-enterprise-org", org.id);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load organization");
      setOrganization(null);
      setRole(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  const value = useMemo(
    () => ({
      organization,
      org: organization,
      role,
      loading,
      error,
      refetch: fetchOrg,
    }),
    [organization, role, loading, error, fetchOrg]
  );

  return (
    <EnterpriseContext.Provider value={value}>
      {children}
    </EnterpriseContext.Provider>
  );
}

export function useEnterprise() {
  const ctx = useContext(EnterpriseContext);
  if (!ctx) throw new Error("useEnterprise must be used within EnterpriseProvider");
  return ctx;
}

/** Safe outside EnterpriseProvider (returns null). */
export function useEnterpriseOptional(): EnterpriseContextValue | null {
  return useContext(EnterpriseContext);
}
