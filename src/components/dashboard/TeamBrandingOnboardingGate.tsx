"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { planAllowsPersonalTeamSeats } from "@/lib/pricing-data";
import { sumExtraTeamSeats } from "@/lib/team-seat-pricing";
import PersonalTeamIdentityForm from "@/components/dashboard/PersonalTeamIdentityForm";

/**
 * After subscribing to a plan with a personal team workspace, require a team name (logo optional)
 * before using the personal dashboard. The `/team/...` shell can load in setup mode without extra
 * seats; collaboration and full pool features still require purchased seats.
 */
export default function TeamBrandingOnboardingGate() {
  const { user } = useAuth();
  const {
    teamSeatCounts,
    planId,
    teamShellExists,
    loading: subLoading,
  } = useSubscription();
  const pathname = usePathname();
  const extraSeats = sumExtraTeamSeats(teamSeatCounts);

  const isTeamRoute = typeof pathname === "string" && pathname.startsWith("/team/");
  const teamOwnerFromPath = isTeamRoute ? pathname.split("/")[2] ?? null : null;
  const shouldEvaluateOwner =
    Boolean(user) && (teamOwnerFromPath === null || teamOwnerFromPath === user?.uid);

  const allowsTeamWorkspace = planAllowsPersonalTeamSeats(planId);
  const paidTeamEligible =
    allowsTeamWorkspace && planId !== "free" && teamShellExists;

  const [gateResolved, setGateResolved] = useState(false);
  const [needsBranding, setNeedsBranding] = useState(false);

  useEffect(() => {
    if (!user || subLoading) return;

    if (!shouldEvaluateOwner) {
      setNeedsBranding(false);
      setGateResolved(true);
      return;
    }

    if (!paidTeamEligible) {
      setNeedsBranding(false);
      setGateResolved(true);
      return;
    }

    let cancelled = false;
    setGateResolved(false);

    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(
          `/api/personal-team/settings?owner_uid=${encodeURIComponent(user.uid)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok || cancelled) {
          if (!cancelled) {
            setNeedsBranding(false);
            setGateResolved(true);
          }
          return;
        }
        const data = (await res.json()) as { team_name: string | null };
        const hasName = Boolean((data.team_name ?? "").trim());
        if (!cancelled) {
          setNeedsBranding(!hasName);
          setGateResolved(true);
        }
      } catch {
        if (!cancelled) {
          setNeedsBranding(false);
          setGateResolved(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, subLoading, shouldEvaluateOwner, paidTeamEligible]);

  useEffect(() => {
    if (!needsBranding || !user) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [needsBranding, user]);

  if (!gateResolved || !needsBranding || !user) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-neutral-950/75 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-branding-title"
      aria-describedby="team-branding-desc"
    >
      <PersonalTeamIdentityForm
        ownerUid={user.uid}
        layout="modal"
        hasExtraSeats={extraSeats > 0}
        onComplete={() => setNeedsBranding(false)}
      />
    </div>
  );
}
