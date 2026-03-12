"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase/client";

/**
 * Auth guard for desktop route. Allows free users (no redirect to upgrade).
 * Unauthenticated users go to login with redirect back to /desktop.
 */
export default function DesktopAuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    if (loading) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname || "/desktop")}`);
    }
  }, [user, loading, pathname, router]);

  if (!isFirebaseConfigured()) {
    return <>{children}</>;
  }
  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-100 dark:bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-bizzi-blue border-t-transparent" />
      </div>
    );
  }
  return <>{children}</>;
}
