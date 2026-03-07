"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { isFirebaseConfigured } from "@/lib/firebase/client";

export default function EnterpriseAuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const { org, loading: orgLoading } = useEnterprise();
  const router = useRouter();

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    if (authLoading) return;
    if (!user) {
      router.replace("/login?redirect=/enterprise");
      return;
    }
    if (!orgLoading && !org) {
      router.replace("/dashboard?createOrg=1");
    }
  }, [user, authLoading, org, orgLoading, router]);

  if (!isFirebaseConfigured()) {
    return <>{children}</>;
  }
  if (authLoading || orgLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-100 dark:bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-bizzi-blue border-t-transparent" />
      </div>
    );
  }
  if (!user) {
    return null;
  }
  if (!org) {
    return null;
  }
  return <>{children}</>;
}
