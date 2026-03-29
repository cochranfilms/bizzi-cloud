"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { trackCheckoutFunnelEvent } from "@/lib/checkout-funnel-analytics";

/**
 * When user lands on dashboard after Stripe checkout with session_id,
 * sync their profile from the checkout session. Handles webhook failures (e.g. 307).
 * Triggers subscription refetch so UI updates instantly.
 */
export default function CheckoutSuccessSync() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { refetch } = useSubscription();
  const syncedRef = useRef(false);
  const funnelLandingRef = useRef(false);

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    const sessionId = searchParams.get("session_id");
    if (!user || checkout !== "success" || !sessionId) return;

    if (!funnelLandingRef.current) {
      funnelLandingRef.current = true;
      trackCheckoutFunnelEvent("checkout_success_dashboard");
    }

    if (syncedRef.current) return;

    syncedRef.current = true;

    (async () => {
      try {
        const token = await getFirebaseAuth().currentUser?.getIdToken(true);
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const res = await fetch(`${base}/api/stripe/sync-session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ session_id: sessionId }),
        });
        if (res.ok) {
          await refetch();
          window.dispatchEvent(new CustomEvent("subscription-updated"));
          const updated = searchParams.get("updated");
          const isPlanChange = updated === "subscription";
          const path = isPlanChange
            ? "/dashboard/settings"
            : "/dashboard/settings?purchase_confirmed=1";
          router.replace(path, {
            scroll: false,
          });
        }
      } catch {
        // Ignore - user can retry from Settings
      }
    })();
  }, [searchParams, user, router, refetch]);

  return null;
}
