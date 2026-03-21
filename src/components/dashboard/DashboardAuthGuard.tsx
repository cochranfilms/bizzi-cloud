"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase/client";

export default function DashboardAuthGuard({
  children,
}: {
  children: React.ReactNode;
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
  if (loading || !user || !statusChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-100 dark:bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-bizzi-blue border-t-transparent" />
      </div>
    );
  }
  return <>{children}</>;
}
