"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseFirestore } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import DashboardRouteFade from "@/components/dashboard/DashboardRouteFade";
import {
  PERSONAL_TEAM_SETTINGS_COLLECTION,
  personalTeamSeatDocId,
} from "@/lib/personal-team-constants";
import { getThemeVariables } from "@/lib/enterprise-themes";
import type { EnterpriseThemeId } from "@/types/enterprise";
import { PERSONAL_TEAM_SEAT_ACCESS_LABELS, type PersonalTeamSeatAccess } from "@/lib/team-seat-pricing";

const SESSION_TEAM_KEY = "bizzi-active-personal-team";

export interface PersonalTeamWorkspaceContextValue {
  teamOwnerUid: string;
  /** Display label for switcher / chrome */
  teamName: string;
  roleLabel: string;
  loading: boolean;
}

const PersonalTeamWorkspaceContext =
  createContext<PersonalTeamWorkspaceContextValue | null>(null);

function roleForMemberLevel(level: string | undefined): string {
  if (level === "none" || !level) return "Member";
  return PERSONAL_TEAM_SEAT_ACCESS_LABELS[level as PersonalTeamSeatAccess] ?? "Member";
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
  const [teamName, setTeamName] = useState<string>("Team workspace");
  const [roleLabel, setRoleLabel] = useState<string>("Member");
  const [accessLoading, setAccessLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const resolveTeamLabel = useCallback(async (ownerUid: string): Promise<string> => {
    try {
      const db = getFirebaseFirestore();
      const settingsSnap = await getDoc(
        doc(db, PERSONAL_TEAM_SETTINGS_COLLECTION, ownerUid)
      );
      const customName = (settingsSnap.data()?.team_name as string | undefined)?.trim();
      if (customName) return customName;
      const snap = await getDoc(doc(db, "profiles", ownerUid));
      const d = snap.data();
      const name =
        (d?.display_name as string)?.trim() ||
        (d?.displayName as string)?.trim() ||
        (d?.name as string)?.trim() ||
        "";
      if (name) return name.endsWith("s") ? `${name}' team` : `${name}'s team`;
    } catch {
      /* ignore */
    }
    return "Team workspace";
  }, []);

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
    if (!allowed || !teamOwnerUid) return;
    let cancelled = false;
    (async () => {
      try {
        const db = getFirebaseFirestore();
        const snap = await getDoc(doc(db, PERSONAL_TEAM_SETTINGS_COLLECTION, teamOwnerUid));
        const themeId = ((snap.data()?.theme as string | undefined) ?? "bizzi") as EnterpriseThemeId;
        if (cancelled) return;
        const vars = getThemeVariables(themeId);
        for (const [k, v] of Object.entries(vars)) {
          document.documentElement.style.setProperty(k, v);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      document.documentElement.style.removeProperty("--enterprise-primary");
      document.documentElement.style.removeProperty("--enterprise-accent");
    };
  }, [allowed, teamOwnerUid]);

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
          const label = await resolveTeamLabel(teamOwnerUid);
          if (cancelled) return;
          setTeamName(label);
          setRoleLabel("Admin");
          setAllowed(true);
          return;
        }

        const db = getFirebaseFirestore();
        const seatId = personalTeamSeatDocId(teamOwnerUid, user.uid);
        const seatSnap = await getDoc(doc(db, "personal_team_seats", seatId));
        const st = seatSnap.data()?.status as string | undefined;
        if (!seatSnap.exists() || (st !== "active" && st !== "cold_storage")) {
          if (!cancelled) {
            setAllowed(false);
          }
          return;
        }
        const level = seatSnap.data()?.seat_access_level as string | undefined;
        const label = await resolveTeamLabel(teamOwnerUid);
        if (cancelled) return;
        setTeamName(label);
        setRoleLabel(roleForMemberLevel(level));
        setAllowed(true);
      } finally {
        if (!cancelled) setAccessLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, teamOwnerUid, resolveTeamLabel]);

  useEffect(() => {
    if (authLoading || accessLoading) return;
    if (user && !allowed) {
      router.replace("/dashboard");
    }
  }, [authLoading, accessLoading, user, allowed, router]);

  const value = useMemo<PersonalTeamWorkspaceContextValue | null>(() => {
    if (!allowed) return null;
    return {
      teamOwnerUid,
      teamName,
      roleLabel,
      loading: false,
    };
  }, [allowed, teamOwnerUid, teamName, roleLabel]);

  const ready = !authLoading && !accessLoading && !!user && allowed && value !== null;

  return (
    <PersonalTeamWorkspaceContext.Provider value={value}>
      <DashboardRouteFade
        ready={ready}
        srOnlyMessage="Loading team workspace"
        placeholderClassName="min-h-screen rounded-none"
      >
        {ready ? children : null}
      </DashboardRouteFade>
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
