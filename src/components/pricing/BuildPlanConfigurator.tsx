"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  plans,
  powerUpAddons,
  PLAN_LABELS,
  ADDON_LABELS,
  STORAGE_ADDONS,
  STORAGE_ADDON_LABELS,
  getStorageAddonTb,
  planAllowsPersonalTeamSeats,
  type StorageAddonId,
} from "@/lib/pricing-data";
import {
  PERSONAL_TEAM_SEAT_ACCESS_LABELS,
  TEAM_SEAT_MONTHLY_USD,
  MAX_EXTRA_PERSONAL_TEAM_SEATS,
  maxSelectableForTier,
  sumExtraTeamSeats,
  teamSeatMonthlySubtotal,
  emptyTeamSeatCounts,
  type PersonalTeamSeatAccess,
  type TeamSeatCounts,
} from "@/lib/team-seat-pricing";
import { PLAN_STORAGE_BYTES } from "@/lib/plan-constants";
import type {
  SubscriptionPreviewLineItem,
  SubscriptionReceiptDisplay,
} from "@/lib/stripe-subscription-line-items";
import { AlertTriangle, Check, Loader2, Mail, Minus, Plus } from "lucide-react";

export type PlanBuilderCheckoutPayload = {
  planId: string;
  addonIds: string[];
  billing: "monthly" | "annual";
  storageAddonId: string | null;
  teamSeatCounts: TeamSeatCounts;
};

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

const PLAN_ORDER = ["solo", "indie", "video", "production"];

const ZERO_TEAM_SEAT_COUNTS = {
  none: 0,
  gallery: 0,
  editor: 0,
  fullframe: 0,
} as const;

function getPlanOrder(planId: string): number {
  if (planId === "free") return -1;
  const i = PLAN_ORDER.indexOf(planId);
  return i >= 0 ? i : 999;
}

function getPlanStorageBytes(planId: string, storageAddonId: string | null): number {
  const base = PLAN_STORAGE_BYTES[planId as keyof typeof PLAN_STORAGE_BYTES] ?? 0;
  if (!storageAddonId || (planId !== "indie" && planId !== "video")) return base;
  const addonTb = getStorageAddonTb(storageAddonId);
  return base + addonTb * 1024 * 1024 * 1024 * 1024;
}

function formatBytes(bytes: number): string {
  const tb = bytes / (1024 * 1024 * 1024 * 1024);
  if (tb >= 1) return `${tb.toFixed(1)} TB`;
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
}

export type BuildPlanConfiguratorProps = {
  mode: "landing" | "dashboard";
  /** Hide extra-TB add-ons (landing only; dashboard should pass true). */
  showAdditionalStorage: boolean;
  className?: string;
  /** Optional title override (landing uses “Build your plan”). */
  title?: string;
  subtitle?: string;
  /** Dashboard: subscription sync + change flow */
  subscriptionLoading?: boolean;
  currentPlanId?: string | null;
  currentAddonIds?: string[];
  currentStorageAddonId?: string | null;
  subscriptionTeamSeats?: TeamSeatCounts;
  refetchSubscription?: () => void;
  /** Landing: invoked when user clicks Subscribe (parent handles auth + Stripe). */
  onLandingSubscribe?: (payload: PlanBuilderCheckoutPayload) => void;
  landingSubscribeLoading?: boolean;
  landingError?: string | null;
};

export default function BuildPlanConfigurator({
  mode,
  showAdditionalStorage,
  className = "",
  title,
  subtitle,
  subscriptionLoading = false,
  currentPlanId = "free",
  currentAddonIds = [],
  currentStorageAddonId = null,
  subscriptionTeamSeats = emptyTeamSeatCounts(),
  refetchSubscription,
  onLandingSubscribe,
  landingSubscribeLoading = false,
  landingError = null,
}: BuildPlanConfiguratorProps) {
  const router = useRouter();
  const { user } = useAuth();
  const isDashboard = mode === "dashboard";
  const isLanding = mode === "landing";

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
    isLanding ? "indie" : null
  );
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [selectedStorageAddonId, setSelectedStorageAddonId] = useState<string | null>(null);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [previewAmount, setPreviewAmount] = useState<{ cents: number; isCredit: boolean } | null>(null);
  const [previewLineItems, setPreviewLineItems] = useState<SubscriptionPreviewLineItem[]>([]);
  const [previewSubtotalCents, setPreviewSubtotalCents] = useState<number | null>(null);
  const [previewTaxCents, setPreviewTaxCents] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [chargeConfirmOpen, setChargeConfirmOpen] = useState(false);
  const [paymentRecoveryHint, setPaymentRecoveryHint] = useState<string | null>(null);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [successDetails, setSuccessDetails] = useState<{
    planLabel: string;
    addons: string[];
    storageLabel: string | null;
    amountCents: number | null;
    isCredit: boolean | null;
    /** Itemized invoice snapshot; matches the receipt email when present */
    receipt: SubscriptionReceiptDisplay | null;
  } | null>(null);
  const [restoreRequirements, setRestoreRequirements] = useState<{
    totalBytesUsed: number;
    requiredAddonIds: string[];
  } | null>(null);
  const [draftTeamSeats, setDraftTeamSeats] = useState({
    none: 0,
    gallery: 0,
    editor: 0,
    fullframe: 0,
  });

  useEffect(() => {
    if (!isDashboard || currentPlanId !== "free" || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getFirebaseAuth().currentUser?.getIdToken(true);
        if (!token || cancelled) return;
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const res = await fetch(`${base}/api/storage/cold-storage-status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          restoreRequirements?: { totalBytesUsed: number; requiredAddonIds: string[] };
        };
        if (!cancelled && data.restoreRequirements) {
          setRestoreRequirements(data.restoreRequirements);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDashboard, currentPlanId, user]);

  useEffect(() => {
    if (!isDashboard || subscriptionLoading) return;
    if (currentPlanId && currentPlanId !== "free") {
      setSelectedPlanId(currentPlanId);
      setSelectedAddonIds(currentAddonIds ?? []);
      setSelectedStorageAddonId(currentStorageAddonId ?? null);
      setDraftTeamSeats({
        none: subscriptionTeamSeats.none,
        gallery: subscriptionTeamSeats.gallery,
        editor: subscriptionTeamSeats.editor,
        fullframe: subscriptionTeamSeats.fullframe,
      });
    }
  }, [
    isDashboard,
    subscriptionLoading,
    currentPlanId,
    currentAddonIds,
    currentStorageAddonId,
    subscriptionTeamSeats,
  ]);

  const isRestoringFromDelete = isDashboard && currentPlanId === "free" && !!restoreRequirements;

  useEffect(() => {
    if (
      !isDashboard ||
      currentPlanId !== "free" ||
      !restoreRequirements?.requiredAddonIds?.length ||
      !selectedPlanId
    ) {
      return;
    }
    setSelectedAddonIds(restoreRequirements.requiredAddonIds);
  }, [isDashboard, currentPlanId, restoreRequirements?.requiredAddonIds, selectedPlanId]);

  useEffect(() => {
    if (selectedPlanId === "solo" || selectedPlanId === "production") {
      setSelectedStorageAddonId(null);
    } else if (
      (selectedPlanId === "indie" || selectedPlanId === "video") &&
      selectedStorageAddonId
    ) {
      const validIds = (STORAGE_ADDONS[selectedPlanId as "indie" | "video"] ?? []).map((x) => x.id);
      if (!validIds.includes(selectedStorageAddonId as StorageAddonId)) {
        setSelectedStorageAddonId(null);
      }
    }
  }, [selectedPlanId, selectedStorageAddonId]);

  const effectiveTeamSeats = useMemo(() => {
    if (!selectedPlanId || selectedPlanId === "solo" || !planAllowsPersonalTeamSeats(selectedPlanId)) {
      return ZERO_TEAM_SEAT_COUNTS;
    }
    return draftTeamSeats;
  }, [selectedPlanId, draftTeamSeats]);

  const teamSeatsChanged =
    isDashboard &&
    (effectiveTeamSeats.none !== subscriptionTeamSeats.none ||
      effectiveTeamSeats.gallery !== subscriptionTeamSeats.gallery ||
      effectiveTeamSeats.editor !== subscriptionTeamSeats.editor ||
      effectiveTeamSeats.fullframe !== subscriptionTeamSeats.fullframe);

  const hasChanges =
    isDashboard &&
    selectedPlanId &&
    (selectedPlanId !== currentPlanId ||
      selectedAddonIds.length !== (currentAddonIds?.length ?? 0) ||
      selectedAddonIds.some((id) => !(currentAddonIds ?? []).includes(id)) ||
      (currentAddonIds ?? []).some((id) => !selectedAddonIds.includes(id)) ||
      selectedStorageAddonId !== (currentStorageAddonId ?? null) ||
      teamSeatsChanged);

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

    const newMonthly =
      planPrice(newPlan, billing) +
      addonPrice(selectedAddonIds) +
      storagePrice(selectedPlanId, selectedStorageAddonId);
    const currentMonthly =
      planPrice(currentPlan, billing) +
      addonPrice(currentAddonIds ?? []) +
      storagePrice(currentPlanId, currentStorageAddonId ?? null);
    const diff = newMonthly - currentMonthly;
    if (Math.abs(diff) < 0.01) return null;
    return { cents: Math.round(Math.abs(diff) * 100), isCredit: diff < 0 };
  }

  useEffect(() => {
    if (!isDashboard || !hasChanges || !selectedPlanId || !user || currentPlanId === "free") {
      setPreviewAmount(null);
      return;
    }
    setPreviewLoading(true);
    setPreviewAmount(null);
    setPreviewLineItems([]);
    setPreviewSubtotalCents(null);
    setPreviewTaxCents(null);
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
            teamSeatCounts: effectiveTeamSeats,
          }),
          signal: ac.signal,
        });
        if (!res.ok || ac.signal.aborted) return;
        const data = (await res.json()) as {
          amountDueCents?: number;
          isCredit?: boolean;
          lineItems?: SubscriptionPreviewLineItem[];
          subtotalCents?: number | null;
          taxCents?: number | null;
        };
        if (typeof data.amountDueCents === "number" && !ac.signal.aborted) {
          setPreviewAmount({ cents: data.amountDueCents, isCredit: data.isCredit === true });
        }
        if (!ac.signal.aborted) {
          setPreviewLineItems(Array.isArray(data.lineItems) ? data.lineItems : []);
          setPreviewSubtotalCents(typeof data.subtotalCents === "number" ? data.subtotalCents : null);
          setPreviewTaxCents(typeof data.taxCents === "number" ? data.taxCents : null);
        }
      } catch {
        // fall back
      } finally {
        if (!ac.signal.aborted) setPreviewLoading(false);
      }
    })();
    return () => ac.abort();
  }, [
    isDashboard,
    hasChanges,
    selectedPlanId,
    selectedAddonIds,
    selectedStorageAddonId,
    billing,
    user,
    currentPlanId,
    effectiveTeamSeats,
  ]);

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

  const adjustTeamSeatTier = useCallback((tier: PersonalTeamSeatAccess, delta: number) => {
    setDraftTeamSeats((prev) => {
      let nextVal = prev[tier] + delta;
      if (nextVal < 0) nextVal = 0;
      const tentative = { ...prev, [tier]: nextVal };
      const maxForTier = maxSelectableForTier(tentative, tier);
      if (tentative[tier] > maxForTier) tentative[tier] = maxForTier;
      return tentative;
    });
  }, []);

  const openBillingPortal = useCallback(async () => {
    if (!user) return;
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken(true);
      if (!token) return;
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/stripe/portal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (res.ok && data.url) {
        window.location.href = data.url;
      }
    } catch {
      // ignore
    }
  }, [user]);

  const applySubscriptionChanges = useCallback(async () => {
    if (!selectedPlanId || !user || !isDashboard || !refetchSubscription) return;
    setApplyLoading(true);
    setApplyError(null);
    setPaymentRecoveryHint(null);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken(true);
      if (!token) {
        setApplyError("Session expired. Please sign in again.");
        return;
      }
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const teamSeatCountsPayload =
        selectedPlanId === "solo" || !planAllowsPersonalTeamSeats(selectedPlanId)
          ? { none: 0, gallery: 0, editor: 0, fullframe: 0 }
          : draftTeamSeats;
      const payload = {
        planId: selectedPlanId,
        addonIds: selectedAddonIds,
        billing,
        storageAddonId: selectedStorageAddonId,
        teamSeatCounts: teamSeatCountsPayload,
      };
      const body = JSON.stringify(payload);
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      if (currentPlanId === "free") {
        const checkoutRes = await fetch(`${base}/api/stripe/checkout`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        const checkoutData = (await checkoutRes.json()) as { url?: string; error?: string };
        if (checkoutRes.ok && checkoutData.url) {
          window.location.href = checkoutData.url;
          return;
        }
        setApplyError(checkoutData.error ?? "Checkout failed. Try the pricing page to start fresh.");
        return;
      }

      const res = await fetch(`${base}/api/stripe/update-subscription`, {
        method: "POST",
        headers,
        body,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        receipt?: SubscriptionReceiptDisplay;
        url?: string;
        error?: string;
        code?: string;
        updatePaymentMethod?: string;
      };
      if (res.ok && data.ok) {
        refetchSubscription();
        window.dispatchEvent(new CustomEvent("subscription-updated"));
        const planLabel = PLAN_LABELS[selectedPlanId] ?? selectedPlanId;
        const addons = selectedAddonIds.map((id) => ADDON_LABELS[id] ?? id);
        const storageLabel = selectedStorageAddonId
          ? STORAGE_ADDON_LABELS[selectedStorageAddonId as StorageAddonId] ?? selectedStorageAddonId
          : null;
        setSuccessDetails({
          planLabel,
          addons,
          storageLabel,
          amountCents: displayAmount?.cents ?? null,
          isCredit: displayAmount?.isCredit ?? null,
          receipt: data.receipt ?? null,
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
      if (data.updatePaymentMethod) {
        setPaymentRecoveryHint(data.updatePaymentMethod);
      }
      const errMsg = data.error ?? "Update failed";
      setApplyError(data.code === "PAYMENT_FAILED" ? errMsg : data.code ? `${errMsg} (${data.code})` : errMsg);
    } catch {
      setApplyError("Update failed. Please try again.");
    } finally {
      setApplyLoading(false);
    }
  }, [
    isDashboard,
    currentPlanId,
    selectedPlanId,
    selectedAddonIds,
    selectedStorageAddonId,
    billing,
    user,
    refetchSubscription,
    displayAmount,
    draftTeamSeats,
  ]);

  const handleCancelSubscription = useCallback(async () => {
    if (!user || !isDashboard) return;
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
  }, [user, router, isDashboard]);

  const minStorageBytes = restoreRequirements?.totalBytesUsed ?? 0;
  const requiredAddonIds = restoreRequirements?.requiredAddonIds ?? [];
  const storageSelected = !!selectedPlanId;

  const planMeetsStorage = useCallback(
    (planId: string, storageAddonId: string | null) => {
      if (minStorageBytes <= 0) return true;
      return getPlanStorageBytes(planId, storageAddonId) >= minStorageBytes;
    },
    [minStorageBytes]
  );

  const planCanMeetStorage = useCallback(
    (planId: string) => {
      if (minStorageBytes <= 0) return true;
      if (planId === "solo") return PLAN_STORAGE_BYTES.solo >= minStorageBytes;
      if (planId === "production") return PLAN_STORAGE_BYTES.production >= minStorageBytes;
      if (planId === "indie" || planId === "video") {
        const base = PLAN_STORAGE_BYTES[planId as "indie" | "video"];
        const addons = STORAGE_ADDONS[planId as "indie" | "video"] ?? [];
        const maxAddonTb = addons.length > 0 ? Math.max(...addons.map((a) => a.tb)) : 0;
        const maxBytes = base + maxAddonTb * 1024 * 1024 * 1024 * 1024;
        return maxBytes >= minStorageBytes;
      }
      return true;
    },
    [minStorageBytes]
  );

  useEffect(() => {
    if (
      !showAdditionalStorage ||
      !minStorageBytes ||
      (selectedPlanId !== "indie" && selectedPlanId !== "video") ||
      planMeetsStorage(selectedPlanId, selectedStorageAddonId)
    ) {
      return;
    }
    const addons = STORAGE_ADDONS[selectedPlanId as "indie" | "video"] ?? [];
    const firstValid = addons.find((a) => planMeetsStorage(selectedPlanId!, a.id));
    if (firstValid) setSelectedStorageAddonId(firstValid.id);
  }, [showAdditionalStorage, minStorageBytes, selectedPlanId, selectedStorageAddonId, planMeetsStorage]);

  const badgeReferencePlanId =
    isLanding ? "free" : (currentPlanId ?? "free");

  const currentPlanLabel = PLAN_LABELS[currentPlanId ?? "free"] ?? "Starter Free";

  const allowedPlans = isRestoringFromDelete
    ? plans.filter((p) => planCanMeetStorage(p.id))
    : plans;

  const allowedAddons =
    isRestoringFromDelete && requiredAddonIds.length > 0
      ? powerUpAddons.filter((a) => requiredAddonIds.includes(a.id))
      : powerUpAddons;

  const selectedPlanMeetsStorage =
    !selectedPlanId ||
    !isRestoringFromDelete ||
    planMeetsStorage(selectedPlanId, selectedStorageAddonId);

  const selectedAddonsCorrect =
    !isRestoringFromDelete ||
    requiredAddonIds.length === 0 ||
    requiredAddonIds.every((id) => selectedAddonIds.includes(id));

  const canApply =
    isDashboard &&
    selectedPlanId &&
    selectedPlanMeetsStorage &&
    selectedAddonsCorrect &&
    (requiredAddonIds.length === 0 || selectedAddonIds.length === requiredAddonIds.length);

  const handleApplyButtonClick = useCallback(() => {
    if (!hasChanges || applyLoading || !canApply) return;
    if (!selectedPlanId || !user || !isDashboard || !refetchSubscription) return;
    if (currentPlanId === "free") {
      void applySubscriptionChanges();
      return;
    }
    setChargeConfirmOpen(true);
  }, [
    hasChanges,
    applyLoading,
    canApply,
    selectedPlanId,
    user,
    isDashboard,
    refetchSubscription,
    currentPlanId,
    applySubscriptionChanges,
  ]);

  const handleConfirmCharge = useCallback(() => {
    setChargeConfirmOpen(false);
    void applySubscriptionChanges();
  }, [applySubscriptionChanges]);

  const handleLandingSubscribeClick = () => {
    if (!selectedPlanId || !onLandingSubscribe) return;
    const teamSeatCountsPayload =
      selectedPlanId === "solo" || !planAllowsPersonalTeamSeats(selectedPlanId)
        ? emptyTeamSeatCounts()
        : draftTeamSeats;
    onLandingSubscribe({
      planId: selectedPlanId,
      addonIds: selectedAddonIds,
      billing,
      storageAddonId: showAdditionalStorage ? selectedStorageAddonId : null,
      teamSeatCounts: teamSeatCountsPayload,
    });
  };

  const showAdditionalStorageSection =
    showAdditionalStorage && (selectedPlanId === "indie" || selectedPlanId === "video");

  const heading = title ?? (isLanding ? "Build your plan" : undefined);
  const sub =
    subtitle ??
    (isLanding
      ? "Choose a base plan, Power Ups, and seats — same builder as in your account."
      : undefined);

  return (
    <div className={className}>
      {heading ? (
        <h3 className="text-xl font-bold text-neutral-900 dark:text-white">{heading}</h3>
      ) : null}
      {sub ? (
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{sub}</p>
      ) : null}

      {isDashboard && isRestoringFromDelete && (
        <div
          className={`mb-6 flex gap-3 rounded-xl border-2 border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20 ${heading ? "mt-6" : ""}`}
          role="alert"
        >
          <AlertTriangle className="h-6 w-6 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            <p className="font-semibold text-amber-900 dark:text-amber-100">
              Restore requirements — your files need a plan that meets these conditions:
            </p>
            <ul className="list-inside list-disc space-y-1 text-amber-800 dark:text-amber-200">
              <li>
                <strong>Storage:</strong> You used {formatBytes(minStorageBytes)} before deleting.
                Choose only plans that offer at least that much storage (base plan or plan + storage
                add-on).
              </li>
              <li>
                <strong>Power-up:</strong>{" "}
                {requiredAddonIds.length > 0 ? (
                  <>
                    You had{" "}
                    {requiredAddonIds.map((id) => ADDON_LABELS[id] ?? id).join(" or ")} with galleries
                    or RAW folder files. You must select the same power-up so your files restore
                    correctly into the right place.
                  </>
                ) : (
                  <>You had no power-ups.</>
                )}
              </li>
            </ul>
          </div>
        </div>
      )}

      {isDashboard && (
        <div className={`mb-8 rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900 ${heading ? "mt-6" : !isRestoringFromDelete ? "mt-0" : ""}`}>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Your current plan</h2>
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
      )}

      <div className={`mb-8 ${isLanding && heading ? "mt-6" : isLanding ? "mt-0" : ""}`}>
        <h3 className="mb-4 text-base font-semibold text-neutral-900 dark:text-white">
          Choose a plan
        </h3>
        <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
          {isLanding ? (
            <>
              Pick the storage tier that fits your workflow, then add Power Ups and any extra seats you need before you
              subscribe.
            </>
          ) : (
            <>
              Select a plan to upgrade or downgrade. You get credit for unused time on your current plan and pay only
              the difference.
            </>
          )}
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {allowedPlans.map((plan) => {
            const isSelected = plan.id === selectedPlanId;
            const meetsStorage = planCanMeetStorage(plan.id);
            const badge =
              isDashboard && plan.id === currentPlanId && !hasChanges
                ? "Current"
                : isDashboard
                  ? getPlanOrder(plan.id) > getPlanOrder(badgeReferencePlanId)
                    ? "Upgrade"
                    : getPlanOrder(plan.id) < getPlanOrder(badgeReferencePlanId)
                      ? "Downgrade"
                      : null
                  : getPlanOrder(plan.id) > getPlanOrder(badgeReferencePlanId)
                    ? "Upgrade"
                    : null;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => meetsStorage && setSelectedPlanId(plan.id)}
                disabled={!meetsStorage}
                className={`relative flex flex-col rounded-xl border-2 p-5 text-left transition-all ${
                  !meetsStorage
                    ? "cursor-not-allowed border-neutral-200 bg-neutral-100 opacity-60 dark:border-neutral-700 dark:bg-neutral-800/80"
                    : isSelected
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
                <h4 className="font-semibold text-neutral-900 dark:text-white">{plan.name}</h4>
                <p className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">${plan.price}</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">/mo · {plan.storage}</p>
              </button>
            );
          })}
        </div>
      </div>

      {showAdditionalStorageSection && (
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
              const isSelected =
                opt.id === null ? !selectedStorageAddonId : selectedStorageAddonId === opt.id;
              const storageBytes = getPlanStorageBytes(selectedPlanId!, opt.id);
              const addonMeetsStorage =
                !minStorageBytes || (storageBytes !== null && storageBytes >= minStorageBytes);
              return (
                <button
                  key={opt.id ?? "none"}
                  type="button"
                  onClick={() => addonMeetsStorage && setSelectedStorageAddonId(opt.id)}
                  disabled={!addonMeetsStorage}
                  className={`flex flex-col rounded-xl border-2 p-5 text-left transition-all ${
                    !addonMeetsStorage
                      ? "cursor-not-allowed border-neutral-200 bg-neutral-100 opacity-60 dark:border-neutral-700 dark:bg-neutral-800/80"
                      : isSelected
                        ? "border-bizzi-blue bg-bizzi-blue/5 dark:bg-bizzi-blue/10"
                        : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    {isSelected && <Check className="h-5 w-5 text-bizzi-blue" />}
                  </div>
                  <h4 className="font-semibold text-neutral-900 dark:text-white">
                    {opt.id ? STORAGE_ADDON_LABELS[opt.id as StorageAddonId] ?? opt.id : "None"}
                  </h4>
                  {opt.price > 0 ? (
                    <p className="mt-1 text-lg font-bold text-neutral-900 dark:text-white">
                      +${opt.price}/mo
                    </p>
                  ) : null}
                  {"upgradePrompt" in opt && opt.upgradePrompt && (
                    <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{opt.upgradePrompt}</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div
        className={`relative mb-8 ${isRestoringFromDelete && !storageSelected ? "opacity-60" : ""}`}
      >
        {isRestoringFromDelete && !storageSelected && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-neutral-100/80 dark:bg-neutral-800/80">
            <p className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-700 shadow-sm dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200">
              Select a plan (and storage add-on if applicable) above to continue.
            </p>
          </div>
        )}
        <h3 className="mb-4 text-base font-semibold text-neutral-900 dark:text-white">Power Ups</h3>
        <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
          Add or remove Power Ups to match your workflow.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {allowedAddons.map((addon) => {
            const isSelected = selectedAddonIds.includes(addon.id);
            const isRequired = requiredAddonIds.includes(addon.id);
            const powerUpDisabled = isRestoringFromDelete && !storageSelected;
            return (
              <button
                key={addon.id}
                type="button"
                onClick={() => !isRequired && !powerUpDisabled && toggleAddon(addon.id)}
                disabled={isRequired || powerUpDisabled}
                className={`flex flex-col rounded-xl border-2 p-5 text-left transition-all ${
                  isRequired
                    ? "cursor-default border-bizzi-blue bg-bizzi-blue/5 dark:border-bizzi-blue/10"
                    : isSelected
                      ? "border-bizzi-blue bg-bizzi-blue/5 dark:bg-bizzi-blue/10"
                      : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: addon.accentColor }}>
                    {isRequired ? "Required for restore" : addon.tagline}
                  </span>
                  {(isSelected || isRequired) && (
                    <Check className="h-5 w-5" style={{ color: addon.accentColor }} />
                  )}
                </div>
                <h4 className="font-semibold text-neutral-900 dark:text-white">
                  {addon.name}
                  {isRequired && (
                    <span className="ml-1 text-xs font-normal text-neutral-500">(required)</span>
                  )}
                </h4>
                <p className="mt-1 text-lg font-bold text-neutral-900 dark:text-white">
                  +${addon.price}/mo
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {selectedPlanId && planAllowsPersonalTeamSeats(selectedPlanId) && (
        <div
          className={`relative mb-8 ${isRestoringFromDelete && !storageSelected ? "opacity-60" : ""}`}
        >
          {isRestoringFromDelete && !storageSelected && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-neutral-100/80 dark:bg-neutral-800/80">
              <p className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-700 shadow-sm dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200">
                Select a plan above to edit team seats.
              </p>
            </div>
          )}
          <h3 className="mb-4 text-base font-semibold text-neutral-900 dark:text-white">
            Personal team seats
          </h3>
          <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
            Add extra seats for your <strong className="text-neutral-800 dark:text-neutral-200">personal team</strong>{" "}
            (not an Organization). After checkout, invite members from{" "}
            <Link
              href={user ? `/team/${user.uid}/settings#team-management` : "/dashboard/settings"}
              className="font-medium text-bizzi-blue hover:underline"
            >
              Team settings — manage seats and invites
            </Link>
            .
          </p>
          <div className="space-y-3 rounded-xl border border-cyan-200/80 bg-cyan-50/50 p-4 dark:border-cyan-900/50 dark:bg-cyan-950/25">
            {(["none", "gallery", "editor", "fullframe"] as const).map((tier) => {
              const count = draftTeamSeats[tier];
              const max = maxSelectableForTier(draftTeamSeats, tier);
              const atMax = count >= max;
              const powerUpLocked = isRestoringFromDelete && !storageSelected;
              return (
                <div
                  key={tier}
                  className="flex flex-col gap-3 border-b border-cyan-200/60 pb-3 last:border-0 last:pb-0 dark:border-cyan-900/35 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-white">
                      {PERSONAL_TEAM_SEAT_ACCESS_LABELS[tier]}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      +${TEAM_SEAT_MONTHLY_USD[tier]}/mo per extra seat
                      {billing === "annual" ? " (annual plan uses discounted seat pricing in Stripe)" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Decrease ${tier} seats`}
                      onClick={() => adjustTeamSeatTier(tier, -1)}
                      disabled={count <= 0 || powerUpLocked}
                      className="rounded-lg border border-neutral-200 bg-white p-2 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums text-neutral-900 dark:text-white">
                      {count}
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase ${tier} seats`}
                      onClick={() => adjustTeamSeatTier(tier, 1)}
                      disabled={atMax || powerUpLocked}
                      className="rounded-lg border border-neutral-200 bg-white p-2 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Extra seats: {sumExtraTeamSeats(draftTeamSeats)} / {MAX_EXTRA_PERSONAL_TEAM_SEATS} max (your
              owner seat is included in the base plan). Approx. +${teamSeatMonthlySubtotal(draftTeamSeats)}/mo for
              these seats
              {isDashboard ? " before proration." : "."}
            </p>
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

      {isLanding && landingError && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">{landingError}</p>
      )}

      {isDashboard && applyError && (
        <div className="mb-4 space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">{applyError}</p>
          {paymentRecoveryHint ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{paymentRecoveryHint}</p>
              <button
                type="button"
                onClick={() => void openBillingPortal()}
                className="shrink-0 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                Open billing portal
              </button>
            </div>
          ) : null}
        </div>
      )}

      {isDashboard && hasChanges && selectedPlanId && (
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

      {isLanding ? (
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={handleLandingSubscribeClick}
            disabled={!selectedPlanId || landingSubscribeLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-bizzi-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-bizzi-cyan disabled:opacity-50"
          >
            {landingSubscribeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Subscribe
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={handleApplyButtonClick}
            disabled={!hasChanges || applyLoading || !canApply}
            className="inline-flex items-center gap-2 rounded-lg bg-bizzi-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-bizzi-cyan disabled:opacity-50"
          >
            {applyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
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
      )}

      {isDashboard && chargeConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Confirm subscription change
            </h3>
            {displayAmount && !displayAmount.isCredit && displayAmount.cents > 0 ? (
              <p className="mt-3 text-sm text-neutral-700 dark:text-neutral-300">
                Your <strong>saved payment method will be charged immediately</strong> for the prorated
                amount below (not only on your next invoice date).
              </p>
            ) : displayAmount?.isCredit ? (
              <p className="mt-3 text-sm text-neutral-700 dark:text-neutral-300">
                No charge today. A credit will be applied toward your subscription.
              </p>
            ) : (
              <p className="mt-3 text-sm text-neutral-700 dark:text-neutral-300">
                You are about to update your subscription. Review the summary Stripe calculated below.
              </p>
            )}
            <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm dark:border-neutral-600 dark:bg-neutral-800/50">
              {previewLoading ? (
                <p className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading breakdown…
                </p>
              ) : previewLineItems.length > 0 ? (
                <ul className="max-h-48 space-y-2 overflow-y-auto pr-1">
                  {previewLineItems.map((row, i) => (
                    <li
                      key={`${row.description}-${i}`}
                      className="flex justify-between gap-3 border-b border-neutral-200/80 pb-2 text-neutral-800 last:border-0 dark:border-neutral-600 dark:text-neutral-200"
                    >
                      <span className="min-w-0 break-words">
                        {row.isProration ? (
                          <span className="text-neutral-500 dark:text-neutral-400">Proration · </span>
                        ) : null}
                        {row.description}
                      </span>
                      <span className="shrink-0 tabular-nums font-medium">
                        {formatCents(row.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-neutral-600 dark:text-neutral-400">
                  Line items will match your plan and add-ons. If details don&apos;t load, you can still
                  proceed — the amount due matches the estimate above.
                </p>
              )}
              {(previewSubtotalCents !== null || previewTaxCents !== null) &&
              !previewLoading &&
              previewLineItems.length > 0 ? (
                <div className="mt-3 space-y-1 border-t border-neutral-200 pt-3 text-xs text-neutral-600 dark:border-neutral-600 dark:text-neutral-400">
                  {previewSubtotalCents !== null ? (
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span className="tabular-nums">{formatCents(previewSubtotalCents)}</span>
                    </div>
                  ) : null}
                  {previewTaxCents !== null && previewTaxCents > 0 ? (
                    <div className="flex justify-between">
                      <span>Tax</span>
                      <span className="tabular-nums">{formatCents(previewTaxCents)}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {displayAmount ? (
                <p className="mt-3 text-base font-bold text-green-600 dark:text-green-400">
                  {displayAmount.isCredit ? (
                    <>{formatCents(displayAmount.cents)} credit</>
                  ) : displayAmount.cents > 0 ? (
                    <>{formatCents(displayAmount.cents)} due now</>
                  ) : (
                    <>$0.00 due now</>
                  )}
                </p>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
              After a successful update, we&apos;ll send a receipt to your account email when receipts are
              enabled for your workspace.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setChargeConfirmOpen(false)}
                className="rounded-lg border border-neutral-200 px-4 py-2.5 text-sm font-medium dark:border-neutral-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCharge}
                disabled={applyLoading || previewLoading}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-bizzi-cyan disabled:opacity-50"
              >
                {applyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {displayAmount && !displayAmount.isCredit && displayAmount.cents > 0
                  ? "Charge card & apply"
                  : "Confirm changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isDashboard && successModalOpen && successDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[min(90dvh,40rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <Check className="h-6 w-6 text-green-600 dark:text-green-400" strokeWidth={2.5} />
            </div>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
              {successDetails.receipt ? "Your subscription was updated" : "Plan updated successfully"}
            </h3>

            {successDetails.receipt ? (
              <div className="mt-4 space-y-4 text-sm">
                <p className="text-neutral-600 dark:text-neutral-400">
                  {successDetails.receipt.changeSummary}
                </p>
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900/50 dark:bg-green-950/40">
                  <p className="text-base font-semibold text-green-800 dark:text-green-200">
                    Total: {successDetails.receipt.totalAmount}
                  </p>
                  <p className="mt-1 text-green-700 dark:text-green-300/90">
                    {successDetails.receipt.amountStatusLine}
                  </p>
                </div>
                <p className="text-neutral-500 dark:text-neutral-400">
                  {successDetails.receipt.prorationNote}
                </p>
                {successDetails.receipt.lineItems.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-600">
                    <table className="w-full min-w-[280px] border-collapse text-left text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b-2 border-neutral-200 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800/80">
                          <th className="px-3 py-2 font-semibold text-neutral-800 dark:text-neutral-200">
                            Description
                          </th>
                          <th className="whitespace-nowrap px-3 py-2 text-right font-semibold text-neutral-800 dark:text-neutral-200">
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {successDetails.receipt.lineItems.map((row, idx) => (
                          <tr
                            key={`${row.description}-${idx}`}
                            className="border-b border-neutral-100 dark:border-neutral-700/80"
                          >
                            <td className="px-3 py-2 text-neutral-700 dark:text-neutral-300">
                              {row.description}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-neutral-900 dark:text-white">
                              {formatCents(row.amountCents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-neutral-500 dark:text-neutral-400">No line items on this invoice.</p>
                )}
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Reference: Invoice {successDetails.receipt.invoiceId}
                </p>
                <div className="flex items-start gap-2 rounded-lg bg-neutral-100 px-3 py-2.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-neutral-500" aria-hidden />
                  <span>
                    The same breakdown was emailed to your billing address so you have it for your
                    records.
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
                <p>
                  <strong className="text-neutral-900 dark:text-white">{successDetails.planLabel}</strong>
                  {successDetails.addons.length > 0 && <> · {successDetails.addons.join(", ")}</>}
                  {successDetails.storageLabel && <> · {successDetails.storageLabel}</>}
                </p>
                {successDetails.amountCents !== null && (
                  <p className="font-medium text-green-600 dark:text-green-400">
                    {successDetails.isCredit ? (
                      <>{formatCents(successDetails.amountCents)} credit applied to your account</>
                    ) : (
                      <>{formatCents(successDetails.amountCents)} charged to your card on file (prorated)</>
                    )}
                  </p>
                )}
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  If you don&apos;t see itemized lines here, check your email for a full receipt.
                </p>
              </div>
            )}

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

      {isDashboard && cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Downgrade to Free?
            </h3>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Your subscription will cancel at the end of the current billing period. You&apos;ll keep access
              until then.
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
    </div>
  );
}
