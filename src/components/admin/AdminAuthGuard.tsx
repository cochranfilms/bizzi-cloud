"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

/**
 * Guards admin routes. Requires auth.
 * TODO: Add admin role check when backend supports it.
 * Example: Check Firebase custom claims (admin: true) or env ALLOWED_ADMIN_EMAILS.
 */
export default function AdminAuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?redirect=/admin");
      return;
    }
    // TODO: Validate user is admin (e.g. custom claim or email in env list)
    // if (!isAdmin(user)) { router.replace("/dashboard"); }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100 dark:bg-neutral-950">
        <Loader2 className="h-8 w-8 animate-spin text-bizzi-blue dark:text-bizzi-cyan" />
      </div>
    );
  }

  return <>{children}</>;
}
