"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

/**
 * Guards admin routes. Requires auth and admin access (ALLOWED_ADMIN_EMAILS).
 * When env is not set, any authenticated user can access (dev mode).
 */
export default function AdminAuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [adminCheckDone, setAdminCheckDone] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?redirect=/admin");
      return;
    }

    setAdminCheckDone(false);
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/admin/auth-check", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        if (res.status === 403 || res.status === 401) {
          router.replace("/dashboard");
          return;
        }
        setAdminCheckDone(true);
      } catch {
        if (!cancelled) router.replace("/dashboard");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading, router]);

  if (loading || !user || !adminCheckDone) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100 dark:bg-neutral-950">
        <Loader2 className="h-8 w-8 animate-spin text-bizzi-blue dark:text-bizzi-cyan" />
      </div>
    );
  }

  return <>{children}</>;
}
