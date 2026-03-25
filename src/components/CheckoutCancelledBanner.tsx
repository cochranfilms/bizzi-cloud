"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

export default function CheckoutCancelledBanner() {
  const searchParams = useSearchParams();
  const [dismissed, setDismissed] = useState(false);

  const checkout = searchParams.get("checkout");
  const checkoutCancelled = checkout === "cancelled";
  const checkoutUpgrade = checkout === "upgrade";

  if ((!checkoutCancelled && !checkoutUpgrade) || dismissed) return null;

  const message = checkoutUpgrade
    ? "Complete your subscription to access the dashboard."
    : "Checkout was cancelled. Ready when you are?";
  const ctaText = checkoutUpgrade ? "Choose a plan" : "View plans";

  return (
    <div className="sticky top-28 z-40 mx-auto max-w-6xl px-6 py-3">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/50">
        <p className="text-sm text-amber-900 dark:text-amber-100">{message}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="#pricing"
            className="rounded-lg bg-amber-200 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-300 dark:bg-amber-800 dark:text-amber-100 dark:hover:bg-amber-700"
          >
            {ctaText}
          </Link>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
            aria-label="Dismiss"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
