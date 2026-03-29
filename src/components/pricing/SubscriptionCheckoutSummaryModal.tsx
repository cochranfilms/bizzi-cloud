"use client";

import { Loader2 } from "lucide-react";
import { productSettingsCopy } from "@/lib/product-settings-copy";

export type SubscriptionSummaryAddon = { id: string; label: string; priceNote?: string };

export default function SubscriptionCheckoutSummaryModal({
  open,
  onClose,
  onConfirm,
  planId,
  planName,
  billing,
  addons,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  planId: string;
  planName: string;
  billing: "monthly" | "annual";
  addons: SubscriptionSummaryAddon[];
  loading: boolean;
}) {
  if (!open) return null;

  const billingLabel = billing === "annual" ? "Annual" : "Monthly";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50"
        onClick={loading ? undefined : onClose}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscription-summary-title"
      >
        <h2 id="subscription-summary-title" className="text-lg font-semibold text-neutral-900 dark:text-white">
          Review your purchase
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Same summary before checkout whether you&apos;re signed in or creating an account.
        </p>

        <ul className="mt-4 space-y-3 text-sm text-neutral-800 dark:text-neutral-200">
          <li>
            <span className="font-medium text-neutral-600 dark:text-neutral-400">
              {productSettingsCopy.basePlan.shortLabel}:
            </span>{" "}
            {planName}
          </li>
          <li>
            <span className="font-medium text-neutral-600 dark:text-neutral-400">Billing:</span>{" "}
            {billingLabel}
          </li>
          <li>
            <span className="font-medium text-neutral-600 dark:text-neutral-400">
              {productSettingsCopy.powerUps.label}:
            </span>{" "}
            {addons.length > 0 ? addons.map((a) => a.label).join(", ") : "None"}
          </li>
          <li className="rounded-lg border border-cyan-200/80 bg-cyan-50/60 px-3 py-2 dark:border-cyan-900/50 dark:bg-cyan-950/25">
            <p className="font-medium text-neutral-900 dark:text-white">
              {productSettingsCopy.personalTeamSeats.notInCheckoutTitle}
            </p>
            <p className="mt-1 text-neutral-700 dark:text-neutral-300">
              {productSettingsCopy.personalTeamSeats.addLaterLine}.
            </p>
          </li>
        </ul>

        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-600 dark:bg-neutral-800/50">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {productSettingsCopy.billing.whatYouCanChangeLater}
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
            <li>{productSettingsCopy.basePlan.label}</li>
            <li>{productSettingsCopy.powerUps.label}</li>
            {planId !== "solo" ? <li>{productSettingsCopy.storageAddons.label}</li> : null}
            {planId === "indie" || planId === "video" || planId === "production" ? (
              <li>{productSettingsCopy.personalTeamSeats.label}</li>
            ) : null}
          </ul>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Back
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-bizzi-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-bizzi-cyan disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Continue to checkout
          </button>
        </div>
      </div>
    </div>
  );
}
