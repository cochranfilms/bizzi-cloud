"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";

const PAID_PLANS = ["solo", "indie", "video", "production"];

export default function DashboardAuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [planChecked, setPlanChecked] = useState(false);
  const [hasPaidPlan, setHasPaidPlan] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    if (loading) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const res = await fetch(`${base}/api/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { plan_id?: string };
          setHasPaidPlan(
            PAID_PLANS.includes(data.plan_id ?? "free")
          );
        }
      } catch {
        if (!cancelled) setHasPaidPlan(false);
      } finally {
        if (!cancelled) setPlanChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading, pathname, router]);

  useEffect(() => {
    if (!planChecked || hasPaidPlan) return;
    router.replace("/?checkout=upgrade");
  }, [planChecked, hasPaidPlan, router]);

  if (!isFirebaseConfigured()) {
    return <>{children}</>;
  }
  if (loading || !user || !planChecked || !hasPaidPlan) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-100 dark:bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-bizzi-blue border-t-transparent" />
      </div>
    );
  }
  return <>{children}</>;
}
