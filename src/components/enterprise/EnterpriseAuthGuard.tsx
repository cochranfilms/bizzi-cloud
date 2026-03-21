"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { isFirebaseConfigured } from "@/lib/firebase/client";

const ENTERPRISE_STORAGE_KEY = "bizzi-enterprise-org";
const RETRY_DELAY_MS = 800;
const MAX_RETRIES = 2;

export default function EnterpriseAuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const { org, loading: orgLoading, refetch } = useEnterprise();
  const router = useRouter();
  const retryCountRef = useRef(0);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    if (authLoading) return;
    if (!user) {
      router.replace("/login?redirect=/enterprise");
      return;
    }
    if (orgLoading) return;
    if (org) return; // Success

    const hasStoredOrg =
      typeof window !== "undefined" &&
      !!sessionStorage.getItem(ENTERPRISE_STORAGE_KEY);

    const doRedirect = () => {
      sessionStorage.removeItem(ENTERPRISE_STORAGE_KEY);
      router.replace("/dashboard?createOrg=1");
    };

    if (hasStoredOrg && retryCountRef.current < MAX_RETRIES) {
      setRetrying(true);
      const t = setTimeout(() => {
        retryCountRef.current += 1;
        refetch().finally(() => setRetrying(false));
      }, RETRY_DELAY_MS);
      return () => clearTimeout(t);
    }

    const t = setTimeout(doRedirect, hasStoredOrg ? 500 : 0);
    return () => clearTimeout(t);
  }, [user, authLoading, org, orgLoading, router, refetch]);

  if (!isFirebaseConfigured()) {
    return <>{children}</>;
  }
  if (authLoading || orgLoading || retrying) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-neutral-100 dark:bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-bizzi-blue border-t-transparent" />
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {retrying ? "Loading organization…" : "Loading…"}
        </p>
      </div>
    );
  }
  if (!user) {
    return null;
  }
  if (!org) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-neutral-100 dark:bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-bizzi-blue border-t-transparent" />
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Redirecting…
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
