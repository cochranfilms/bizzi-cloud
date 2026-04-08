"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { shouldEnforceWorkspaceOnboardingRedirect } from "@/lib/workspace-onboarding";
import { DashboardLoadingPlaceholder } from "@/components/dashboard/DashboardRouteFade";

/**
 * Blocks personal/team shell until mandatory workspace onboarding completes (new signups).
 * Centralized redirect rules — keep in sync with {@link WORKSPACE_ONBOARDING_ROUTE_EXEMPT_PREFIXES}.
 *
 * Mandatory redirects use `/workspace/setup` with **no query** — `?review=1` is only for the optional
 * Settings entry and does not affect enforcement (the setup route is always exempt from blocking).
 */
export default function WorkspaceOnboardingEnforcement({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "allow">("loading");

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setPhase("allow");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/account/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (!res.ok) {
          setPhase("allow");
          return;
        }
        const data = (await res.json()) as { workspace_onboarding_pending?: boolean };
        const pending = data.workspace_onboarding_pending === true;

        if (
          pending &&
          shouldEnforceWorkspaceOnboardingRedirect({
            pathname,
            userUid: user.uid,
            pending: true,
          })
        ) {
          router.replace("/workspace/setup");
          return;
        }
        if (!cancelled) setPhase("allow");
      } catch {
        if (!cancelled) setPhase("allow");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, pathname, router]);

  if (authLoading || (user && phase === "loading")) {
    return (
      <div className="flex min-h-screen flex-col bg-neutral-100 dark:bg-neutral-950">
        <DashboardLoadingPlaceholder
          srOnlyMessage="Loading workspace"
          placeholderClassName="min-h-screen rounded-none"
        />
      </div>
    );
  }

  return <>{children}</>;
}
