"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import DashboardRouteFade, {
  DashboardLoadingPlaceholder,
} from "@/components/dashboard/DashboardRouteFade";
import {
  dashboardPerfMarks,
  markDashboardPerf,
} from "@/lib/dashboard-client-timing";

export default function DashboardAuthGuard({
  children,
  /** When true, only run auth + account checks (no fade). Use under another route fade (e.g. enterprise org gate) to avoid stacked fades. */
  skipFade = false,
  /**
   * When "inShell", the guard wraps only the main route segment inside {@link DashboardShell}
   * so chrome (nav, panels) can paint while `/api/account/status` runs.
   */
  contentMode = "fullscreen",
}: {
  children: React.ReactNode;
  skipFade?: boolean;
  contentMode?: "fullscreen" | "inShell";
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [statusChecked, setStatusChecked] = useState(false);

  /** Warm the heaviest dashboard chunk in parallel with account status (home embedded Storage). */
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    if (loading || !user) return;
    if (pathname !== "/dashboard") return;
    void import(/* webpackChunkName: "file-grid" */ "@/components/dashboard/FileGrid");
  }, [loading, user, pathname]);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    if (loading) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

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
          markDashboardPerf(dashboardPerfMarks.accountStatusOk);
        }
        setStatusChecked(true);
      } catch {
        setStatusChecked(true);
      }
    })();
  }, [user, loading, pathname, router]);

  if (!isFirebaseConfigured()) {
    return <>{children}</>;
  }
  const ready = !loading && !!user && statusChecked;
  const shellInner = contentMode === "inShell";
  const fadePlaceholder = shellInner
    ? "min-h-[min(52vh,28rem)] flex-1 rounded-none w-full"
    : "min-h-screen rounded-none";
  const outerClass = shellInner
    ? "flex min-h-0 min-w-0 flex-1 flex-col"
    : "min-h-screen bg-neutral-100 dark:bg-neutral-950";

  return (
    <div className={outerClass}>
      {skipFade ? (
        <>
          {!ready && (
            <DashboardLoadingPlaceholder
              srOnlyMessage="Loading dashboard"
              placeholderClassName={fadePlaceholder}
            />
          )}
          {ready ? (
            shellInner ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
            ) : (
              children
            )
          ) : null}
        </>
      ) : (
        <DashboardRouteFade
          ready={ready}
          srOnlyMessage="Loading dashboard"
          placeholderClassName={fadePlaceholder}
          readyContentClassName={
            shellInner ? "flex min-h-0 min-w-0 flex-1 flex-col" : ""
          }
        >
          {ready ? children : null}
        </DashboardRouteFade>
      )}
    </div>
  );
}
