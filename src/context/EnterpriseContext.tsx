"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseFirestore } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import type { Organization, OrganizationRole } from "@/types/enterprise";

interface EnterpriseContextValue {
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
    max_seats: data.max_seats ?? null,
    addon_ids: addonIds.length > 0 ? addonIds : undefined,
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
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const db = getFirebaseFirestore();
      const profileRef = doc(db, "profiles", user.uid);
      const profileSnap = await getDoc(profileRef);
      const profileData = profileSnap.data();

      const orgId = profileData?.organization_id as string | undefined;
      const orgRole = profileData?.organization_role as OrganizationRole | undefined;

      if (!orgId) {
        setOrganization(null);
        setRole(null);
        setLoading(false);
        return;
      }

      const orgRef = doc(db, "organizations", orgId);
      const orgSnap = await getDoc(orgRef);

      if (!orgSnap.exists()) {
        setOrganization(null);
        setRole(null);
        setLoading(false);
        return;
      }

      const org = parseOrgFromFirestore(orgSnap.id, orgSnap.data()!);
      setOrganization(org);
      setRole(orgRole ?? "member");
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
