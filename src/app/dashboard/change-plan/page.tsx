"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/dashboard/TopBar";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  plans,
  powerUpAddons,
  PLAN_LABELS,
  ADDON_LABELS,
} from "@/lib/pricing-data";
import { ArrowLeft, Check, Loader2 } from "lucide-react";

const PLAN_ORDER = ["solo", "indie", "video", "production"];

function getPlanOrder(planId: string): number {
  const i = PLAN_ORDER.indexOf(planId);
  return i >= 0 ? i : 999;
}

export default function ChangePlanPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { planId: currentPlanId, addonIds: currentAddonIds, hasPortalAccess, loading: subLoading } = useSubscription();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  useEffect(() => {
    if (subLoading) return;
    if (currentPlanId && currentPlanId !== "free") {
      setSelectedPlanId(currentPlanId);
      setSelectedAddonIds(currentAddonIds ?? []);
    }
  }, [subLoading, currentPlanId, currentAddonIds]);

  const toggleAddon = useCallback((addonId: string) => {
    setSelectedAddonIds((prev) => {
      if (addonId === "fullframe") {
        if (prev.includes("fullframe")) return prev.filter((id) => id !== "fullframe");
        return ["fullframe"];
      }
      const next = prev.filter((id) => id !== "fullframe");
      if (next.includes(addonId)) return next.filter((id) => id !== addonId);
      return [...next, addonId];
    });
  }, []);

  const handleApply = useCallback(async () => {
    if (!selectedPlanId || !user) return;
    setApplyLoading(true);
    setApplyError(null);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken(true);
      if (!token) {
        setApplyError("Session expired. Please sign in again.");
        return;
      }
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/stripe/update-subscription`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          planId: selectedPlanId,
          addonIds: selectedAddonIds,
          billing,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        router.push("/dashboard/settings?updated=subscription");
      } else {
        setApplyError(data.error ?? "Update failed");
      }
    } catch {
      setApplyError("Update failed. Please try again.");
    } finally {
      setApplyLoading(false);
    }
  }, [selectedPlanId, selectedAddonIds, billing, user, router]);

  const handleCancelSubscription = useCallback(async () => {
    if (!user) return;
    setCancelLoading(true);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken(true);
      if (!token) return;
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/stripe/cancel-subscription`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ immediate: false }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setCancelModalOpen(false);
        router.push("/dashboard/settings?cancelled=subscription");
      }
    } finally {
      setCancelLoading(false);
    }
  }, [user, router]);

  if (!user) return null;

  if (subLoading) {
    return (
      <>
        <TopBar title="Change Plan" />
        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-4xl flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          </div>
        </main>
      </>
    );
  }

  if (currentPlanId === "free" && !hasPortalAccess) {
    return (
      <>
        <TopBar title="Change Plan" />
        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-2xl">
            <Link
              href="/dashboard/settings"
              className="mb-6 inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Settings
            </Link>
            <div className="rounded-xl border border-neutral-200 bg-white p-8 dark:border-neutral-700 dark:bg-neutral-900">
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                Upgrade your plan
              </h2>
              <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                You&apos;re on Starter Free. Choose a paid plan to unlock more storage and features.
              </p>
              <Link
                href="/#pricing"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan"
              >
                View pricing and upgrade
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (!hasPortalAccess) {
    return (
      <>
        <TopBar title="Change Plan" />
        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-2xl">
            <Link
              href="/dashboard/settings"
              className="mb-6 inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Settings
            </Link>
            <div className="rounded-xl border border-neutral-200 bg-white p-8 dark:border-neutral-700 dark:bg-neutral-900">
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                Sync your subscription
              </h2>
              <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                If you just subscribed but still see Starter Free, sync your subscription from Stripe in Settings.
              </p>
              <Link
                href="/dashboard/settings"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white"
              >
                Go to Settings
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  const currentPlanLabel = PLAN_LABELS[currentPlanId ?? "free"] ?? "Starter Free";
  const hasChanges =
    selectedPlanId !== currentPlanId ||
    selectedAddonIds.length !== (currentAddonIds?.length ?? 0) ||
    selectedAddonIds.some((id) => !(currentAddonIds ?? []).includes(id)) ||
    (currentAddonIds ?? []).some((id) => !selectedAddonIds.includes(id));

  return (
    <>
      <TopBar title="Change Plan" />
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/dashboard/settings"
            className="mb-6 inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Settings
          </Link>

          <div className="mb-8 rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Your current plan
            </h2>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">
              <strong className="text-neutral-900 dark:text-white">{currentPlanLabel}</strong>
              {currentAddonIds && currentAddonIds.length > 0 && (
                <> · {currentAddonIds.map((id) => ADDON_LABELS[id] ?? id).join(", ")}</>
              )}
            </p>
          </div>

          <div className="mb-8">
            <h3 className="mb-4 text-base font-semibold text-neutral-900 dark:text-white">
              Choose a plan
            </h3>
            <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
              Select a plan to upgrade or downgrade. Changes take effect immediately with prorated billing.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan) => {
                const isCurrent = plan.id === currentPlanId;
                const isSelected = plan.id === selectedPlanId;
                const badge =
                  isCurrent && !hasChanges
                    ? "Current"
                    : getPlanOrder(plan.id) > getPlanOrder(currentPlanId ?? "free")
                      ? "Upgrade"
                      : getPlanOrder(plan.id) < getPlanOrder(currentPlanId ?? "free")
                        ? "Downgrade"
                        : null;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`relative flex flex-col rounded-xl border-2 p-5 text-left transition-all ${
                      isSelected
                        ? "border-bizzi-blue bg-bizzi-blue/5 dark:bg-bizzi-blue/10"
                        : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: badge ? plan.accentColor + "20" : "transparent",
                          color: badge ? plan.accentColor : "inherit",
                        }}
                      >
                        {badge ?? plan.tagline}
                      </span>
                    </div>
                    <h4 className="font-semibold text-neutral-900 dark:text-white">
                      {plan.name}
                    </h4>
                    <p className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">
                      ${plan.price}
                    </p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      /mo · {plan.storage}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-8">
            <h3 className="mb-4 text-base font-semibold text-neutral-900 dark:text-white">
              Power Ups
            </h3>
            <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
              Add or remove Power Ups to match your workflow.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {powerUpAddons.map((addon) => {
                const isSelected = selectedAddonIds.includes(addon.id);
                return (
                  <button
                    key={addon.id}
                    type="button"
                    onClick={() => toggleAddon(addon.id)}
                    className={`flex flex-col rounded-xl border-2 p-5 text-left transition-all ${
                      isSelected
                        ? "border-bizzi-blue bg-bizzi-blue/5 dark:bg-bizzi-blue/10"
                        : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className="text-xs font-medium"
                        style={{ color: addon.accentColor }}
                      >
                        {addon.tagline}
                      </span>
                      {isSelected && (
                        <Check
                          className="h-5 w-5"
                          style={{ color: addon.accentColor }}
                        />
                      )}
                    </div>
                    <h4 className="font-semibold text-neutral-900 dark:text-white">
                      {addon.name}
                    </h4>
                    <p className="mt-1 text-lg font-bold text-neutral-900 dark:text-white">
                      +${addon.price}/mo
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-8 flex flex-wrap items-center gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Billing cycle
              </label>
              <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-700">
                <button
                  type="button"
                  onClick={() => setBilling("monthly")}
                  className={`px-4 py-2 text-sm font-medium ${
                    billing === "monthly"
                      ? "rounded-l-lg bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-white"
                      : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBilling("annual")}
                  className={`px-4 py-2 text-sm font-medium ${
                    billing === "annual"
                      ? "rounded-r-lg bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-white"
                      : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  }`}
                >
                  Annual (save 25%)
                </button>
              </div>
            </div>
          </div>

          {applyError && (
            <p className="mb-4 text-sm text-red-600 dark:text-red-400">{applyError}</p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={handleApply}
              disabled={!hasChanges || applyLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-bizzi-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-bizzi-cyan disabled:opacity-50"
            >
              {applyLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Apply changes
            </button>
            <button
              type="button"
              onClick={() => setCancelModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Downgrade to Free
            </button>
          </div>
        </div>
      </main>

      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Downgrade to Free?
            </h3>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Your subscription will cancel at the end of the current billing period. You&apos;ll keep access until then.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                className="flex-1 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium dark:border-neutral-600"
              >
                Keep subscription
              </button>
              <button
                type="button"
                onClick={handleCancelSubscription}
                disabled={cancelLoading}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelLoading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Cancel subscription"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
