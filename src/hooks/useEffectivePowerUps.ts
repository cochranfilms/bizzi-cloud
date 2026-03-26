"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useSubscription } from "@/context/SubscriptionContext";

function flagsFromAddonIds(addonIds: string[] | undefined) {
  const ids = addonIds ?? [];
  return {
    hasEditor: ids.includes("editor") || ids.includes("fullframe"),
    hasGallerySuite: ids.includes("gallery") || ids.includes("fullframe"),
  };
}

/**
 * Power-up visibility for Storage / RAW / Gallery Media.
 * - /enterprise: organization's purchased add-ons (current session org), not the signed-in user's personal plan.
 * - /team/…: seat tier for members (handled in SubscriptionContext); owners use personal add-ons.
 * - /dashboard and elsewhere: personal subscription add-ons.
 */
export function useEffectivePowerUps(): {
  hasEditor: boolean;
  hasGallerySuite: boolean;
  loading: boolean;
} {
  const pathname = usePathname() ?? "";
  const { org, loading: orgLoading } = useEnterprise();
  const sub = useSubscription();

  return useMemo(() => {
    const isEnterprise = pathname.startsWith("/enterprise");
    if (isEnterprise) {
      if (orgLoading) {
        return { hasEditor: false, hasGallerySuite: false, loading: true };
      }
      const f = flagsFromAddonIds(org?.addon_ids);
      return { ...f, loading: false };
    }
    return {
      hasEditor: sub.hasEditor,
      hasGallerySuite: sub.hasGallerySuite,
      loading: sub.loading,
    };
  }, [
    pathname,
    org?.addon_ids,
    orgLoading,
    sub.hasEditor,
    sub.hasGallerySuite,
    sub.loading,
  ]);
}
