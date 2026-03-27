"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import DashboardRouteFade, {
  DashboardLoadingPlaceholder,
} from "@/components/dashboard/DashboardRouteFade";

export default function DashboardAuthGuard({
  children,
  /** When true, only run auth + account checks (no fade). Use under another route fade (e.g. enterprise org gate) to avoid stacked fades. */
  skipFade = false,
}: {
  children: React.ReactNode;
  skipFade?: boolean;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [statusChecked, setStatusChecked] = useState(false);

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
  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950">
      {skipFade ? (
        <>
          {!ready && (
            <DashboardLoadingPlaceholder
              srOnlyMessage="Loading dashboard"
              placeholderClassName="min-h-screen rounded-none"
            />
          )}
          {ready ? children : null}
        </>
      ) : (
        <DashboardRouteFade
          ready={ready}
          srOnlyMessage="Loading dashboard"
          placeholderClassName="min-h-screen rounded-none"
        >
          {ready ? children : null}
        </DashboardRouteFade>
      )}
    </div>
  );
}
