"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getFirebaseAuth } from "@/lib/firebase/client";

/**
 * When user lands on dashboard after Stripe checkout with session_id,
 * sync their profile from the checkout session. Handles webhook failures (e.g. 307).
 */
export default function CheckoutSuccessSync() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const syncedRef = useRef(false);

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    const sessionId = searchParams.get("session_id");
    if (!user || checkout !== "success" || !sessionId || syncedRef.current) return;

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
          const updated = searchParams.get("updated");
          router.replace(updated === "subscription" ? "/dashboard/settings" : "/dashboard", {
            scroll: false,
          });
        }
      } catch {
        // Ignore - user can retry from Settings
      }
    })();
  }, [searchParams, user, router]);

  return null;
}
