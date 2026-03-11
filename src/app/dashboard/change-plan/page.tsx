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
  STORAGE_ADDONS,
  STORAGE_ADDON_LABELS,
  type StorageAddonId,
} from "@/lib/pricing-data";
import { ArrowLeft, Check, Loader2 } from "lucide-react";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

const PLAN_ORDER = ["solo", "indie", "video", "production"];

function getPlanOrder(planId: string): number {
  const i = PLAN_ORDER.indexOf(planId);
  return i >= 0 ? i : 999;
}

export default function ChangePlanPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { planId: currentPlanId, addonIds: currentAddonIds, storageAddonId: currentStorageAddonId, hasPortalAccess, loading: subLoading, refetch } = useSubscription();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [selectedStorageAddonId, setSelectedStorageAddonId] = useState<string | null>(null);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [previewAmount, setPreviewAmount] = useState<{ cents: number; isCredit: boolean } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [successDetails, setSuccessDetails] = useState<{
    planLabel: string;
    addons: string[];
    storageLabel: string | null;
    amountCents: number | null;
    isCredit: boolean | null;
  } | null>(null);

  useEffect(() => {
    if (subLoading) return;
    if (currentPlanId && currentPlanId !== "free") {
      setSelectedPlanId(currentPlanId);
      setSelectedAddonIds(currentAddonIds ?? []);
      setSelectedStorageAddonId(currentStorageAddonId ?? null);
    }
  }, [subLoading, currentPlanId, currentAddonIds, currentStorageAddonId]);

  useEffect(() => {
    if (selectedPlanId === "solo" || selectedPlanId === "production") {
      setSelectedStorageAddonId(null);
    } else if ((selectedPlanId === "indie" || selectedPlanId === "video") && selectedStorageAddonId) {
      const validIds = (STORAGE_ADDONS[selectedPlanId as "indie" | "video"] ?? []).map((x) => x.id);
      if (!validIds.includes(selectedStorageAddonId as StorageAddonId)) {
        setSelectedStorageAddonId(null);
      }
    }
  }, [selectedPlanId, selectedStorageAddonId]);

  const hasChanges =
    selectedPlanId !== currentPlanId ||
    selectedAddonIds.length !== (currentAddonIds?.length ?? 0) ||
    selectedAddonIds.some((id) => !(currentAddonIds ?? []).includes(id)) ||
    (currentAddonIds ?? []).some((id) => !selectedAddonIds.includes(id)) ||
    selectedStorageAddonId !== (currentStorageAddonId ?? null);

  function getEstimatedChange(): { cents: number; isCredit: boolean } | null {
    if (!hasChanges || !selectedPlanId || !currentPlanId || currentPlanId === "free") return null;
    const newPlan = plans.find((p) => p.id === selectedPlanId);
    const currentPlan = plans.find((p) => p.id === currentPlanId);
    if (!newPlan || !currentPlan) return null;

    const planPrice = (p: typeof newPlan, b: "monthly" | "annual") =>
      b === "annual" ? (p.annualPrice ?? p.price * 12) / 12 : p.price;
    const addonPrice = (ids: string[]) => {
      if (ids.includes("fullframe")) return 10;
      return ids.reduce((sum, id) => {
        const a = powerUpAddons.find((x) => x.id === id);
        return sum + (a?.price ?? 0);
      }, 0);
    };
    const storagePrice = (planId: string, storageId: string | null) => {
      if (!storageId || (planId !== "indie" && planId !== "video")) return 0;
      const opts = STORAGE_ADDONS[planId as "indie" | "video"];
      const opt = opts?.find((x) => x.id === storageId);
      return opt?.price ?? 0;
    };

    const newMonthly = planPrice(newPlan, billing) + addonPrice(selectedAddonIds) + storagePrice(selectedPlanId, selectedStorageAddonId);
    const currentMonthly = planPrice(currentPlan, billing) + addonPrice(currentAddonIds ?? []) + storagePrice(currentPlanId, currentStorageAddonId ?? null);
    const diff = newMonthly - currentMonthly;
    if (Math.abs(diff) < 0.01) return null;
    return { cents: Math.round(Math.abs(diff) * 100), isCredit: diff < 0 };
  }

  useEffect(() => {
    if (!hasChanges || !selectedPlanId || !user || currentPlanId === "free") {
      setPreviewAmount(null);
      return;
    }
    setPreviewLoading(true);
    setPreviewAmount(null);
    const ac = new AbortController();
    (async () => {
      try {
        const token = await getFirebaseAuth().currentUser?.getIdToken(true);
        if (!token || ac.signal.aborted) return;
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const res = await fetch(`${base}/api/stripe/subscription-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            planId: selectedPlanId,
            addonIds: selectedAddonIds,
            billing,
            storageAddonId: selectedStorageAddonId,
          }),
          signal: ac.signal,
        });
        if (!res.ok || ac.signal.aborted) return;
        const data = (await res.json()) as { amountDueCents?: number; isCredit?: boolean };
        if (typeof data.amountDueCents === "number" && !ac.signal.aborted) {
          setPreviewAmount({ cents: data.amountDueCents, isCredit: data.isCredit === true });
        }
      } catch {
        // Fall back to estimate
      } finally {
        if (!ac.signal.aborted) setPreviewLoading(false);
      }
    })();
    return () => ac.abort();
  }, [hasChanges, selectedPlanId, selectedAddonIds, selectedStorageAddonId, billing, user, currentPlanId]);

  const displayAmount = previewAmount ?? getEstimatedChange();

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
      const body = JSON.stringify({
        planId: selectedPlanId,
        addonIds: selectedAddonIds,
        billing,
        storageAddonId: selectedStorageAddonId,
      });
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };
      let res = await fetch(`${base}/api/stripe/update-subscription`, {
        method: "POST",
        headers,
        body,
      });
      let data = (await res.json()) as { ok?: boolean; url?: string; error?: string; code?: string };
      if (res.ok && data.ok) {
        refetch();
        window.dispatchEvent(new CustomEvent("subscription-updated"));
        const planLabel = PLAN_LABELS[selectedPlanId] ?? selectedPlanId;
        const addons = selectedAddonIds.map((id) => ADDON_LABELS[id] ?? id);
        const storageLabel = selectedStorageAddonId
          ? (STORAGE_ADDON_LABELS[selectedStorageAddonId as StorageAddonId] ?? selectedStorageAddonId)
          : null;
        setSuccessDetails({
          planLabel,
          addons,
          storageLabel,
          amountCents: displayAmount?.cents ?? null,
          isCredit: displayAmount?.isCredit ?? null,
        });
        setSuccessModalOpen(true);
        return;
      }
      if (res.status === 500 && data.error) {
        const fallbackRes = await fetch(`${base}/api/stripe/checkout-change-plan`, {
          method: "POST",
          headers,
          body,
        });
        const fallbackData = (await fallbackRes.json()) as { url?: string; error?: string };
        if (fallbackRes.ok && fallbackData.url) {
          window.location.href = fallbackData.url;
          return;
        }
      }
      const errMsg = data.error ?? "Update failed";
      setApplyError(data.code ? `${errMsg} (${data.code})` : errMsg);
    } catch {
      setApplyError("Update failed. Please try again.");
    } finally {
      setApplyLoading(false);
    }
  }, [selectedPlanId, selectedAddonIds, selectedStorageAddonId, billing, user, refetch, displayAmount]);

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
              {currentStorageAddonId && (
                <> · {STORAGE_ADDON_LABELS[currentStorageAddonId as StorageAddonId] ?? currentStorageAddonId}</>
              )}
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
              Select a plan to upgrade or downgrade. You get credit for unused time on your current plan and pay only the difference.
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

          {(selectedPlanId === "indie" || selectedPlanId === "video") && (
            <div className="mb-8">
              <h3 className="mb-4 text-base font-semibold text-neutral-900 dark:text-white">
                Additional Storage
              </h3>
              <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
                Add extra storage to your plan.
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { id: null as string | null, label: "None", price: 0 },
                  ...(STORAGE_ADDONS[selectedPlanId as "indie" | "video"] ?? []),
                ].map((opt) => {
                  const isSelected = opt.id === null ? !selectedStorageAddonId : selectedStorageAddonId === opt.id;
                  return (
                    <button
                      key={opt.id ?? "none"}
                      type="button"
                      onClick={() => setSelectedStorageAddonId(opt.id)}
                      className={`flex flex-col rounded-xl border-2 p-5 text-left transition-all ${
                        isSelected
                          ? "border-bizzi-blue bg-bizzi-blue/5 dark:bg-bizzi-blue/10"
                          : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        {isSelected && opt.id && (
                          <Check className="h-5 w-5 text-bizzi-blue" />
                        )}
                        {isSelected && !opt.id && (
                          <Check className="h-5 w-5 text-bizzi-blue" />
                        )}
                      </div>
                      <h4 className="font-semibold text-neutral-900 dark:text-white">
                        {opt.id ? (STORAGE_ADDON_LABELS[opt.id as StorageAddonId] ?? opt.id) : "None"}
                      </h4>
                      {opt.price > 0 ? (
                        <p className="mt-1 text-lg font-bold text-neutral-900 dark:text-white">
                          +${opt.price}/mo
                        </p>
                      ) : null}
                      {"upgradePrompt" in opt && opt.upgradePrompt && (
                        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                          {opt.upgradePrompt}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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

          {hasChanges && selectedPlanId && (
            <div className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
              <p className="mb-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Change amount
              </p>
              {previewLoading ? (
                <p className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calculating…
                </p>
              ) : displayAmount ? (
                <p className="text-xl font-bold text-green-600 dark:text-green-400">
                  {displayAmount.isCredit ? (
                    <>{formatCents(displayAmount.cents)} credit on next bill</>
                  ) : (
                    <>{formatCents(displayAmount.cents)} due now (prorated)</>
                  )}
                </p>
              ) : (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Prorated amount will be charged or credited to your next bill.
                </p>
              )}
            </div>
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

      {successModalOpen && successDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <Check className="h-6 w-6 text-green-600 dark:text-green-400" strokeWidth={2.5} />
            </div>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Plan updated successfully
            </h3>
            <div className="mt-4 space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
              <p>
                <strong className="text-neutral-900 dark:text-white">{successDetails.planLabel}</strong>
                {successDetails.addons.length > 0 && (
                  <> · {successDetails.addons.join(", ")}</>
                )}
                {successDetails.storageLabel && (
                  <> · {successDetails.storageLabel}</>
                )}
              </p>
              {successDetails.amountCents !== null && (
                <p className="font-medium text-green-600 dark:text-green-400">
                  {successDetails.isCredit ? (
                    <>{formatCents(successDetails.amountCents)} credit applied to your account</>
                  ) : (
                    <>{formatCents(successDetails.amountCents)} charged (prorated to your next bill)</>
                  )}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setSuccessModalOpen(false);
                setSuccessDetails(null);
                router.push("/dashboard/settings?updated=subscription");
              }}
              className="mt-6 w-full rounded-lg bg-bizzi-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-bizzi-cyan"
            >
              Continue to Settings
            </button>
          </div>
        </div>
      )}

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
