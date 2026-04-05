"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseFirestore, isFirebaseConfigured } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import DashboardRouteFade from "@/components/dashboard/DashboardRouteFade";
import {
  PERSONAL_TEAM_SETTINGS_COLLECTION,
  personalTeamSeatDocId,
} from "@/lib/personal-team-constants";
import type { EnterpriseThemeId } from "@/types/enterprise";
import {
  PERSONAL_TEAM_SEAT_ACCESS_LABELS,
  type PersonalTeamSeatAccess,
} from "@/lib/team-seat-pricing";

const SESSION_TEAM_KEY = "bizzi-active-personal-team";

export const BIZZI_TEAM_WORKSPACE_UPDATED = "bizzi-team-workspace-updated" as const;

export function notifyTeamWorkspaceUpdated(ownerId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(BIZZI_TEAM_WORKSPACE_UPDATED, { detail: { ownerId } })
  );
}

export interface PersonalTeamWorkspaceContextValue {
  teamOwnerUid: string;
  /** Display label for switcher / chrome */
  teamName: string;
  teamLogoUrl: string | null;
  teamThemeId: EnterpriseThemeId;
  roleLabel: string;
  loading: boolean;
}

const PersonalTeamWorkspaceContext =
  createContext<PersonalTeamWorkspaceContextValue | null>(null);

function roleForMemberLevel(level: string | undefined): string {
  if (level === "none" || !level) return "Member";
  return (
    PERSONAL_TEAM_SEAT_ACCESS_LABELS[level as PersonalTeamSeatAccess] ?? "Member"
  );
}

async function loadTeamWorkspaceAppearance(
  ownerUid: string
): Promise<{
  name: string;
  logoUrl: string | null;
  themeId: EnterpriseThemeId;
}> {
  try {
    const db = getFirebaseFirestore();
    const settingsSnap = await getDoc(
      doc(db, PERSONAL_TEAM_SETTINGS_COLLECTION, ownerUid)
    );
    const data = settingsSnap.data();
    const customName = (data?.team_name as string | undefined)?.trim();
    const logoUrl =
      (data?.logo_url as string | undefined)?.trim() || null;
    const themeId = ((data?.theme as string | undefined) ??
      "bizzi") as EnterpriseThemeId;
    if (customName) {
      return { name: customName, logoUrl, themeId };
    }
    const profSnap = await getDoc(doc(db, "profiles", ownerUid));
    const d = profSnap.data();
    const pName =
      (d?.display_name as string)?.trim() ||
      (d?.displayName as string)?.trim() ||
      (d?.name as string)?.trim() ||
      "";
    const label = pName
      ? pName.endsWith("s")
        ? `${pName}' team`
        : `${pName}'s team`
      : "Team workspace";
    return { name: label, logoUrl, themeId };
  } catch {
    return {
      name: "Team workspace",
      logoUrl: null,
      themeId: "bizzi",
    };
  }
}

export function PersonalTeamWorkspaceProvider({
  teamOwnerUid,
  children,
}: {
  teamOwnerUid: string;
  children: React.ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [teamName, setTeamName] = useState<string>("Team workspace");
  const [teamLogoUrl, setTeamLogoUrl] = useState<string | null>(null);
  const [teamThemeId, setTeamThemeId] = useState<EnterpriseThemeId>("bizzi");
  const [roleLabel, setRoleLabel] = useState<string>("Member");
  const [accessLoading, setAccessLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [statusChecked, setStatusChecked] = useState(!isFirebaseConfigured());

  useEffect(() => {
    if (typeof window !== "undefined" && teamOwnerUid) {
      try {
        sessionStorage.setItem(SESSION_TEAM_KEY, teamOwnerUid);
      } catch {
        /* ignore */
      }
    }
  }, [teamOwnerUid]);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    if (authLoading) return;
    if (!user) {
      setStatusChecked(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/account/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.redirect_to_interstitial) {
            router.replace("/account/personal-deleted");
            return;
          }
        }
        if (!cancelled) setStatusChecked(true);
      } catch {
        if (!cancelled) setStatusChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname ?? "/team")}`);
    }
  }, [authLoading, user, router, pathname]);

  const refreshAppearance = useCallback(async () => {
    if (!teamOwnerUid) return;
    const app = await loadTeamWorkspaceAppearance(teamOwnerUid);
    setTeamName(app.name);
    setTeamLogoUrl(app.logoUrl);
    setTeamThemeId(app.themeId);
  }, [teamOwnerUid]);

  useEffect(() => {
    if (!allowed || !teamOwnerUid) return;
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ ownerId?: string }>).detail;
      if (d?.ownerId && d.ownerId !== teamOwnerUid) return;
      void refreshAppearance();
    };
    window.addEventListener(BIZZI_TEAM_WORKSPACE_UPDATED, handler);
    return () =>
      window.removeEventListener(BIZZI_TEAM_WORKSPACE_UPDATED, handler);
  }, [allowed, teamOwnerUid, refreshAppearance]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setAccessLoading(false);
      setAllowed(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setAccessLoading(true);
      try {
        if (user.uid === teamOwnerUid) {
          const token = await user.getIdToken();
          const res = await fetch("/api/account/workspaces", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            if (!cancelled) setAllowed(false);
            return;
          }
          const data = (await res.json()) as {
            personalTeams?: Array<{
              membershipKind?: string;
              ownerUserId?: string;
            }>;
          };
          const ownedRow =
            Array.isArray(data.personalTeams) &&
            data.personalTeams.some(
              (t) =>
                t?.membershipKind === "owned" &&
                t?.ownerUserId === teamOwnerUid
            );
          if (!ownedRow) {
            if (!cancelled) setAllowed(false);
            return;
          }
          const app = await loadTeamWorkspaceAppearance(teamOwnerUid);
          if (cancelled) return;
          setTeamName(app.name);
          setTeamLogoUrl(app.logoUrl);
          setTeamThemeId(app.themeId);
          setRoleLabel("Admin");
          setAllowed(true);
          return;
        }

        const db = getFirebaseFirestore();
        const seatId = personalTeamSeatDocId(teamOwnerUid, user.uid);
        const [seatSnap, app] = await Promise.all([
          getDoc(doc(db, "personal_team_seats", seatId)),
          loadTeamWorkspaceAppearance(teamOwnerUid),
        ]);
        const st = seatSnap.data()?.status as string | undefined;
        if (
          !seatSnap.exists() ||
          (st !== "active" && st !== "cold_storage")
        ) {
          if (!cancelled) {
            setAllowed(false);
          }
          return;
        }
        const level = seatSnap.data()?.seat_access_level as string | undefined;
        if (cancelled) return;
        setTeamName(app.name);
        setTeamLogoUrl(app.logoUrl);
        setTeamThemeId(app.themeId);
        setRoleLabel(roleForMemberLevel(level));
        setAllowed(true);
      } finally {
        if (!cancelled) setAccessLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, teamOwnerUid]);

  useEffect(() => {
    if (authLoading || accessLoading) return;
    if (user && !allowed) {
      router.replace("/dashboard");
    }
  }, [authLoading, accessLoading, user, allowed, router, teamOwnerUid]);

  const value = useMemo<PersonalTeamWorkspaceContextValue | null>(() => {
    if (!allowed) return null;
    return {
      teamOwnerUid,
      teamName,
      teamLogoUrl,
      teamThemeId,
      roleLabel,
      loading: false,
    };
  }, [
    allowed,
    teamOwnerUid,
    teamName,
    teamLogoUrl,
    teamThemeId,
    roleLabel,
  ]);

  if (!isFirebaseConfigured()) {
    return <>{children}</>;
  }

  if (!authLoading && !user) {
    return null;
  }

  const shellReady =
    !authLoading &&
    !!user &&
    statusChecked &&
    !accessLoading &&
    allowed &&
    value !== null;

  return (
    <PersonalTeamWorkspaceContext.Provider value={value}>
      <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950">
        <DashboardRouteFade
          ready={shellReady}
          srOnlyMessage="Loading team workspace"
          placeholderClassName="min-h-screen rounded-none"
        >
          {shellReady ? children : null}
        </DashboardRouteFade>
      </div>
    </PersonalTeamWorkspaceContext.Provider>
  );
}

export function usePersonalTeamWorkspace(): PersonalTeamWorkspaceContextValue | null {
  return useContext(PersonalTeamWorkspaceContext);
}

export function usePersonalTeamWorkspaceRequired(): PersonalTeamWorkspaceContextValue {
  const ctx = useContext(PersonalTeamWorkspaceContext);
  if (!ctx) {
    throw new Error("usePersonalTeamWorkspaceRequired outside team workspace");
  }
  return ctx;
}
