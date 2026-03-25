"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  freeTier,
  storageTiers,
  powerUpAddons,
  PLAN_LABELS,
  ADDON_LABELS,
} from "@/lib/pricing-data";
import {
  emptyTeamSeatCounts,
  maxSelectableForTier,
  sumExtraTeamSeats,
  teamSeatMonthlySubtotal,
  type PersonalTeamSeatAccess,
  type TeamSeatCounts,
} from "@/lib/team-seat-pricing";
import CheckoutModal from "@/components/CheckoutModal";
import FreeSignUpModal from "@/components/FreeSignUpModal";

function teamExtrasSummaryLine(
  counts: TeamSeatCounts,
  billing: "monthly" | "annual"
): string {
  const mult = billing === "annual" ? 0.75 : 1;
  const sub = teamSeatMonthlySubtotal(counts) * mult;
  if (sumExtraTeamSeats(counts) === 0) return "";
  const parts: string[] = [];
  if (counts.none) parts.push(`${counts.none}× base ($${(9 * mult).toFixed(0)}/ea)`);
  if (counts.gallery)
    parts.push(`${counts.gallery}× Gallery ($${(12 * mult).toFixed(0)}/ea)`);
  if (counts.editor)
    parts.push(`${counts.editor}× Editor ($${(14 * mult).toFixed(0)}/ea)`);
  if (counts.fullframe)
    parts.push(`${counts.fullframe}× Full Frame ($${(16 * mult).toFixed(0)}/ea)`);
  return `Team: ${parts.join(", ")} · ~$${Math.round(sub)}/mo`;
}

export default function PricingSection() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedStorageId, setSelectedStorageId] = useState<string>("free");
  const [selectedAddonId, setSelectedAddonId] = useState<string | null>(null);
  const [teamSeatCounts, setTeamSeatCounts] = useState<TeamSeatCounts>(() =>
    emptyTeamSeatCounts()
  );
  const [selectedBilling, setSelectedBilling] = useState<"monthly" | "annual">("monthly");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const purchaseProcessedRef = useRef(false);
  const [checkoutModal, setCheckoutModal] = useState<{
    planId: string;
    planName: string;
    addonId: string | null;
    addonName?: string;
    billing: "monthly" | "annual";
    priceLabel: string;
    teamSummaryLine: string;
    teamSeatCounts: TeamSeatCounts;
  } | null>(null);

  const selectedTier = storageTiers.find((t) => t.id === selectedStorageId);
  const selectedAddon = powerUpAddons.find((a) => a.id === selectedAddonId);
  const isFree = selectedStorageId === "free";
  const allowsSeats = selectedTier?.allowsSeats ?? false;
  const baseMonthly =
    selectedTier && !isFree
      ? selectedBilling === "annual"
        ? selectedTier.annualPrice / 12
        : selectedTier.price
      : 0;
  const addonMonthly = selectedAddon ? selectedAddon.price : 0;
  const teamSeatRawSubtotal = allowsSeats ? teamSeatMonthlySubtotal(teamSeatCounts) : 0;
  const teamSeatDisplayMultiplier = selectedBilling === "annual" ? 0.75 : 1;
  const teamSeatMonthlyDisplay = teamSeatRawSubtotal * teamSeatDisplayMultiplier;
  const total = baseMonthly + addonMonthly + teamSeatMonthlyDisplay;
  const extraTeamSeatsCount = allowsSeats ? sumExtraTeamSeats(teamSeatCounts) : 0;

  const setTeamTier = (tier: PersonalTeamSeatAccess, value: number) => {
    setTeamSeatCounts((prev) => {
      const max = maxSelectableForTier(prev, tier);
      const v = Math.min(Math.max(0, value), max);
      return { ...prev, [tier]: v };
    });
  };

  const handleCheckout = useCallback(
    async (
      planId: string,
      addonId: string | null,
      billing: "monthly" | "annual",
      counts: TeamSeatCounts
    ) => {
      if (!user) {
        const tier = storageTiers.find((t) => t.id === planId);
        const addon = addonId
          ? powerUpAddons.find((a) => a.id === addonId)
          : null;
        const priceLabel =
          tier && billing === "annual"
            ? `$${tier.annualPrice}/yr`
            : tier
              ? `$${tier.price}/mo`
              : "";
        let label = priceLabel;
        if (addon) label += ` + $${addon.price}/mo add-on`;
        const teamLine = tier?.allowsSeats
          ? teamExtrasSummaryLine(counts, billing)
          : "";
        if (teamLine) label += ` · ${teamLine}`;
        setCheckoutModal({
          planId,
          planName: tier?.name ?? PLAN_LABELS[planId] ?? planId,
          addonId,
          addonName: addon?.name ?? (addonId ? ADDON_LABELS[addonId] : undefined),
          billing,
          priceLabel: label,
          teamSummaryLine: teamLine,
          teamSeatCounts: tier?.allowsSeats ? counts : emptyTeamSeatCounts(),
        });
        return;
      }
      setCheckoutLoading(true);
      setCheckoutError(null);
      try {
        const token = await getFirebaseAuth().currentUser?.getIdToken(true);
        if (!token) {
          setCheckoutError("Session expired. Please sign in again.");
          return;
        }
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const res = await fetch(`${base}/api/stripe/checkout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            planId,
            addonId: addonId || undefined,
            billing,
            teamSeatCounts: counts,
          }),
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok) {
          setCheckoutError(data.error ?? "Checkout failed");
          return;
        }
        if (data.url) {
          window.location.href = data.url;
        } else {
          setCheckoutError("Checkout failed");
        }
      } catch {
        setCheckoutError("Checkout failed. Please try again.");
      } finally {
        setCheckoutLoading(false);
      }
    },
    [user]
  );

  const handleGuestCheckout = useCallback(
    async (data: { name: string; email: string }) => {
      if (!checkoutModal) return;
      setCheckoutLoading(true);
      setCheckoutError(null);
      try {
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const res = await fetch(`${base}/api/stripe/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planId: checkoutModal.planId,
            addonId: checkoutModal.addonId ?? undefined,
            billing: checkoutModal.billing,
            teamSeatCounts: checkoutModal.teamSeatCounts,
            email: data.email,
            name: data.name,
          }),
        });
        const result = (await res.json()) as { url?: string; error?: string };
        if (!res.ok) {
          setCheckoutError(result.error ?? "Checkout failed");
          return;
        }
        if (result.url) {
          window.location.href = result.url;
        } else {
          setCheckoutError("Checkout failed");
        }
      } catch {
        setCheckoutError("Checkout failed. Please try again.");
      } finally {
        setCheckoutLoading(false);
      }
    },
    [checkoutModal]
  );

  useEffect(() => {
    const purchase = searchParams.get("purchase");
    const addon = searchParams.get("addon");
    const billing = searchParams.get("billing");
    if (purchase && user && !purchaseProcessedRef.current) {
      const validPlans = ["solo", "indie", "video", "production"];
      if (validPlans.includes(purchase)) {
        purchaseProcessedRef.current = true;
        handleCheckout(
          purchase,
          addon && ["gallery", "editor", "fullframe"].includes(addon) ? addon : null,
          billing === "annual" ? "annual" : "monthly",
          emptyTeamSeatCounts()
        );
      }
    }
  }, [searchParams, user, handleCheckout]);

  const [freeSignUpModalOpen, setFreeSignUpModalOpen] = useState(false);
  const [enterpriseModalOpen, setEnterpriseModalOpen] = useState(false);
  const [enterpriseSubmitting, setEnterpriseSubmitting] = useState(false);
  const [enterpriseSuccess, setEnterpriseSuccess] = useState(false);
  const [enterpriseError, setEnterpriseError] = useState<string | null>(null);
  const [enterpriseForm, setEnterpriseForm] = useState({
    current_storage_service: "",
    monthly_storage_tb: "",
    favorite_features: [] as string[],
    company_name: "",
    contact_email: "",
    message: "",
  });

  const ENTERPRISE_STORAGE_SERVICES = [
    "Dropbox",
    "Google Drive",
    "AWS S3",
    "Backblaze B2",
    "Frame.io",
    "Adobe Creative Cloud",
    "Box",
    "OneDrive",
    "Other",
  ];
  const ENTERPRISE_FAVORITE_FEATURES = [
    "Galleries & proofing",
    "NLE cloud editing",
    "Transfers & delivery",
    "SSO & permissions",
    "Version history",
    "Storage & backup",
    "Client invoicing",
    "Other",
  ];

  const handleEnterpriseSubmit = useCallback(async () => {
    const { company_name, contact_email, current_storage_service } = enterpriseForm;
    const storageServices = [
      "Dropbox", "Google Drive", "AWS S3", "Backblaze B2", "Frame.io",
      "Adobe Creative Cloud", "Box", "OneDrive", "Other",
    ];
    if (!company_name.trim() || company_name.trim().length < 2) {
      setEnterpriseError("Company name must be at least 2 characters");
      return;
    }
    if (!contact_email.trim() || !contact_email.includes("@")) {
      setEnterpriseError("Valid contact email required");
      return;
    }
    if (!storageServices.includes(current_storage_service)) {
      setEnterpriseError("Please select your current storage service");
      return;
    }
    setEnterpriseSubmitting(true);
    setEnterpriseError(null);
    try {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/enterprise/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_storage_service: enterpriseForm.current_storage_service,
          monthly_storage_tb: enterpriseForm.monthly_storage_tb
            ? parseFloat(enterpriseForm.monthly_storage_tb)
            : 0,
          favorite_features: enterpriseForm.favorite_features,
          company_name: enterpriseForm.company_name.trim(),
          contact_email: enterpriseForm.contact_email.trim(),
          message: enterpriseForm.message.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setEnterpriseSuccess(true);
        setTimeout(() => {
          setEnterpriseModalOpen(false);
          setEnterpriseSuccess(false);
          setEnterpriseForm({
            current_storage_service: "",
            monthly_storage_tb: "",
            favorite_features: [],
            company_name: "",
            contact_email: "",
            message: "",
          });
        }, 2000);
      } else {
        setEnterpriseError(data.error ?? "Failed to submit");
      }
    } catch {
      setEnterpriseError("Failed to submit. Please try again.");
    } finally {
      setEnterpriseSubmitting(false);
    }
  }, [enterpriseForm]);

  const toggleEnterpriseFeature = (feature: string) => {
    setEnterpriseForm((prev) => ({
      ...prev,
      favorite_features: prev.favorite_features.includes(feature)
        ? prev.favorite_features.filter((f) => f !== feature)
        : [...prev.favorite_features, feature],
    }));
  };

  const BADGE_MIN_H = "28px";

  return (
    <section
      id="pricing"
      className="scroll-mt-28 px-6 py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-bizzi-navy md:text-4xl">
            Transparent Pricing
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-neutral-600">
            Start free, scale as your brand grows. No hidden fees, no surprises.
          </p>
        </div>

        {checkoutError && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-200">
            {checkoutError}
          </div>
        )}

        {/* Power Up comparison cards — informational only */}
        <div className="mb-16">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
              Power up any plan
            </h3>
            <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
              Add only what your workflow needs. Available on every paid plan
              (except free).
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Stack freely. Cancel anytime. Add-ons billed monthly.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {powerUpAddons.map((addon) => (
              <div
                key={addon.id}
                className="flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white transition-shadow hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900"
              >
                <div
                  className="h-1 w-full shrink-0"
                  style={{ backgroundColor: addon.accentColor }}
                />
                <div className="flex flex-grow flex-col p-6">
                  <div className="flex items-center">
                    <span
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: addon.accentColor }}
                    >
                      {addon.tagline}
                    </span>
                  </div>
                  <h4
                    className="text-lg font-bold text-neutral-900 dark:text-white"
                    style={{ color: addon.accentColor }}
                  >
                    {addon.name}
                  </h4>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {addon.description}
                  </p>
                  {addon.bundleNote && (
                    <span
                      className="mt-2 inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
                      style={{
                        backgroundColor: addon.accentColor + "15",
                        color: addon.accentColor,
                      }}
                    >
                      ✦ {addon.bundleNote}
                    </span>
                  )}
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-sm text-neutral-500">+</span>
                    <span
                      className="text-2xl font-bold"
                      style={{ color: addon.accentColor }}
                    >
                      ${addon.price}
                    </span>
                    <span className="text-sm text-neutral-500">/mo</span>
                  </div>
                  <ul className="mt-4 flex-grow space-y-1.5 text-sm text-neutral-700 dark:text-neutral-300">
                    {addon.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <span
                          className="shrink-0"
                          style={{ color: addon.accentColor }}
                        >
                          ✓
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 border-t border-neutral-100 pt-3 text-xs text-neutral-500 dark:text-neutral-400">
                    Available on <strong>all paid plans</strong>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Unified Plan Builder */}
        <div id="paid-plans" className="scroll-mt-24 mb-16 rounded-2xl border border-neutral-200 bg-white p-6 md:p-8 dark:border-neutral-700 dark:bg-neutral-900">
          <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
            Build your plan
          </h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Select storage, power ups, and seats. One clear price.
          </p>

          {/* Row 1: Storage tier */}
          <div className="mt-6">
            <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              1. Storage tier
            </label>
            <div className="flex flex-wrap gap-2">
              {storageTiers.map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => {
                    setSelectedStorageId(tier.id);
                    if (tier.id === "free") setSelectedAddonId(null);
                    if (!tier.allowsSeats) setTeamSeatCounts(emptyTeamSeatCounts());
                  }}
                  className={`rounded-xl border-2 px-4 py-3 text-left transition-all ${
                    selectedStorageId === tier.id
                      ? "border-bizzi-blue bg-bizzi-blue/5 dark:bg-bizzi-blue/10"
                      : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-600 dark:hover:border-neutral-500"
                  }`}
                  style={
                    selectedStorageId === tier.id
                      ? { borderColor: tier.accentColor }
                      : undefined
                  }
                >
                  <span className="block font-semibold text-neutral-900 dark:text-white">
                    {tier.name}
                  </span>
                  <span className="block text-sm text-neutral-500 dark:text-neutral-400">
                    {tier.storage}
                    {tier.price === 0 ? " · Free" : ` · $${tier.price}/mo`}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: Power Up (hidden when free) */}
          {!isFree && (
            <div className="mt-6">
              <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                2. Power Up
              </label>
              <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
                Your add-on (admin). Team members can have different access in step 3.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedAddonId(null)}
                    className={`rounded-xl border-2 px-3 py-2 text-left text-xs font-medium leading-snug transition-all sm:text-sm ${
                      !selectedAddonId
                        ? "border-bizzi-blue bg-bizzi-blue/5 dark:bg-bizzi-blue/10"
                        : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-600"
                    }`}
                  >
                    No add-on
                  </button>
                  <span className="min-h-[2.25rem] text-[10px] leading-tight text-neutral-400 dark:text-neutral-500">
                    &nbsp;
                  </span>
                </div>
                {powerUpAddons.map((addon) => (
                  <div key={addon.id} className="flex min-w-0 flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedAddonId(addon.id)}
                      className={`rounded-xl border-2 px-3 py-2 text-left text-xs font-medium leading-snug transition-all sm:text-sm ${
                        selectedAddonId === addon.id
                          ? "text-white"
                          : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-600"
                      }`}
                      style={
                        selectedAddonId === addon.id
                          ? {
                              backgroundColor: addon.accentColor,
                              borderColor: addon.accentColor,
                            }
                          : undefined
                      }
                    >
                      {addon.name} (+${addon.price}/mo)
                    </button>
                    <span
                      className="rounded-md bg-neutral-100 px-2 py-1 text-center text-[10px] font-medium leading-tight text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                      title={addon.tagline}
                    >
                      {addon.tagline}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Row 3: Team seats (only when allowsSeats) */}
          {allowsSeats && (
            <div className="mt-6">
              <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                3. Team seats
              </label>
              <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
                Optional · Shared storage · Not an organization — personal Team only. You’re included;
                pick extra seats and each seat’s access. Annual pricing matches 25% off (shown as
                monthly equivalent).
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(
                  [
                    {
                      key: "none" as const,
                      label: "No add-on",
                      hint: "+$9/seat/mo",
                    },
                    {
                      key: "gallery" as const,
                      label: "Gallery Suite",
                      hint: "+$12/seat/mo",
                    },
                    {
                      key: "editor" as const,
                      label: "Editor",
                      hint: "+$14/seat/mo",
                    },
                    {
                      key: "fullframe" as const,
                      label: "Full Frame",
                      hint: "+$16/seat/mo",
                    },
                  ] as const
                ).map(({ key, label, hint }) => {
                  const maxOpt = maxSelectableForTier(teamSeatCounts, key);
                  return (
                    <div key={key} className="min-w-0">
                      <span className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                        {label}
                      </span>
                      <span className="mb-1 block text-[10px] text-neutral-500">{hint}</span>
                      <select
                        value={teamSeatCounts[key]}
                        onChange={(e) =>
                          setTeamTier(key, parseInt(e.target.value, 10))
                        }
                        className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-2 text-sm text-neutral-900 outline-none focus:border-bizzi-blue dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                      >
                        {Array.from({ length: maxOpt + 1 }, (_, i) => i).map((n) => (
                          <option key={n} value={n}>
                            {n} extra{n === 1 ? " seat" : " seats"}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Row 4: Billing (only when paid) */}
          {!isFree && (
            <div className="mt-6">
              <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                4. Billing
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedBilling("monthly")}
                  className={`rounded-xl border-2 px-4 py-2 text-sm font-medium ${
                    selectedBilling === "monthly"
                      ? "border-bizzi-blue bg-bizzi-blue/5"
                      : "border-neutral-200 dark:border-neutral-600"
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBilling("annual")}
                  className={`rounded-xl border-2 px-4 py-2 text-sm font-medium ${
                    selectedBilling === "annual"
                      ? "border-bizzi-blue bg-bizzi-blue/5"
                      : "border-neutral-200 dark:border-neutral-600"
                  }`}
                >
                  Annual (save 25%)
                </button>
              </div>
            </div>
          )}

          {/* Summary + CTA */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-neutral-50 px-6 py-4 dark:border-neutral-700 dark:bg-neutral-800">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-lg font-bold text-neutral-900 dark:text-white">
                  {isFree ? "Free" : `$${Math.round(total)}/mo`}
                </span>
                {!isFree && (
                  <span className="text-sm text-neutral-500 dark:text-neutral-400">
                    {selectedBilling === "annual" && selectedTier
                      ? `($${selectedTier.annualPrice}/yr billed annually)`
                      : "billed monthly"}
                  </span>
                )}
              </div>
              {!isFree && allowsSeats && extraTeamSeatsCount > 0 && (
                <span className="text-xs font-medium text-bizzi-blue dark:text-bizzi-cyan">
                  {teamExtrasSummaryLine(teamSeatCounts, selectedBilling)}
                </span>
              )}
            </div>
            {isFree ? (
              <button
                type="button"
                onClick={() =>
                  user ? router.push("/dashboard") : setFreeSignUpModalOpen(true)
                }
                className="rounded-xl bg-bizzi-blue px-6 py-3 font-medium text-white transition-colors hover:bg-bizzi-cyan"
                style={{ backgroundColor: freeTier.accentColor }}
              >
                {user ? "Go to Dashboard" : "Get Started Free"}
              </button>
            ) : (
              <button
                type="button"
                disabled={checkoutLoading}
                onClick={() =>
                  handleCheckout(
                    selectedStorageId,
                    selectedAddonId,
                    selectedBilling,
                    allowsSeats ? teamSeatCounts : emptyTeamSeatCounts()
                  )
                }
                className="rounded-xl bg-bizzi-blue px-6 py-3 font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
              >
                {checkoutLoading ? "Redirecting…" : "Subscribe"}
              </button>
            )}
          </div>
        </div>

        {/* Enterprise Plan */}
        <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex-1">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                <span className="h-1.5 w-1.5 rounded-sm bg-neutral-400 dark:bg-neutral-500" />
                For large teams
              </p>
              <h3 className="mb-3 text-2xl font-bold text-neutral-900 dark:text-white">
                Enterprise
              </h3>
              <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                Custom storage, dedicated infrastructure and
                SLA-backed uptime. All add-ons included. Built for agencies,
                post-houses and broadcast studios.
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="flex flex-col justify-center rounded-xl border border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
                  <span className="text-xl font-bold text-neutral-900 dark:text-white">
                    16 TB+
                  </span>
                  <span className="mt-0.5 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Custom Storage
                  </span>
                </div>
                <div className="flex flex-col justify-center rounded-xl border border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
                  <span className="text-xl font-bold text-neutral-900 dark:text-white">
                    Custom
                  </span>
                  <span className="mt-0.5 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Team Seats ($9/seat)
                  </span>
                </div>
                <div className="flex flex-col justify-center rounded-xl border border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
                  <span className="text-xl font-bold text-neutral-900 dark:text-white">
                    99.99%
                  </span>
                  <span className="mt-0.5 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Uptime SLA
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEnterpriseModalOpen(true)}
                className="shrink-0 rounded-xl bg-neutral-200 px-6 py-3 font-medium text-neutral-900 transition-colors hover:bg-neutral-300 dark:bg-neutral-700 dark:text-white dark:hover:bg-neutral-600"
              >
                Contact Sales
              </button>
            </div>
          </div>
        </div>

        {/* Enterprise Contact Modal */}
        {enterpriseModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => !enterpriseSubmitting && setEnterpriseModalOpen(false)}
          >
            <div
              className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-4 text-xl font-bold text-neutral-900 dark:text-white">
                Enterprise — Contact Sales
              </h3>
              {enterpriseSuccess ? (
                <p className="text-green-600 dark:text-green-400">
                  Thanks! We&apos;ll be in touch soon.
                </p>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleEnterpriseSubmit();
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Company name *
                    </label>
                    <input
                      type="text"
                      value={enterpriseForm.company_name}
                      onChange={(e) =>
                        setEnterpriseForm((p) => ({ ...p, company_name: e.target.value }))
                      }
                      className="w-full rounded-lg border border-neutral-200 px-4 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                      placeholder="Acme Productions"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Contact email *
                    </label>
                    <input
                      type="email"
                      value={enterpriseForm.contact_email}
                      onChange={(e) =>
                        setEnterpriseForm((p) => ({ ...p, contact_email: e.target.value }))
                      }
                      className="w-full rounded-lg border border-neutral-200 px-4 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                      placeholder="you@company.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Current storage service *
                    </label>
                    <select
                      value={enterpriseForm.current_storage_service}
                      onChange={(e) =>
                        setEnterpriseForm((p) => ({
                          ...p,
                          current_storage_service: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                      required
                    >
                      <option value="">Choose…</option>
                      {ENTERPRISE_STORAGE_SERVICES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Monthly storage usage (TB)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={enterpriseForm.monthly_storage_tb}
                      onChange={(e) =>
                        setEnterpriseForm((p) => ({ ...p, monthly_storage_tb: e.target.value }))
                      }
                      className="w-full rounded-lg border border-neutral-200 px-4 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                      placeholder="e.g. 20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Favorite features
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {ENTERPRISE_FAVORITE_FEATURES.map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => toggleEnterpriseFeature(f)}
                          className={`rounded-full px-3 py-1 text-sm transition-colors ${
                            enterpriseForm.favorite_features.includes(f)
                              ? "bg-bizzi-blue text-white"
                              : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-300"
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Message (optional)
                    </label>
                    <textarea
                      value={enterpriseForm.message}
                      onChange={(e) =>
                        setEnterpriseForm((p) => ({ ...p, message: e.target.value }))
                      }
                      rows={3}
                      className="w-full rounded-lg border border-neutral-200 px-4 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                      placeholder="Tell us about your needs…"
                    />
                  </div>
                  {enterpriseError && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {enterpriseError}
                    </p>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setEnterpriseModalOpen(false)}
                      disabled={enterpriseSubmitting}
                      className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-600 dark:text-neutral-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={enterpriseSubmitting}
                      className="rounded-xl bg-bizzi-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {enterpriseSubmitting ? "Sending…" : "Submit"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        <FreeSignUpModal
          isOpen={freeSignUpModalOpen}
          onClose={() => setFreeSignUpModalOpen(false)}
        />
        <CheckoutModal
          isOpen={!!checkoutModal}
          onClose={() => {
            setCheckoutModal(null);
            setCheckoutError(null);
          }}
          planId={checkoutModal?.planId ?? ""}
          planName={checkoutModal?.planName ?? ""}
          addonId={checkoutModal?.addonId ?? null}
          addonName={checkoutModal?.addonName}
          billing={checkoutModal?.billing ?? "monthly"}
          priceLabel={checkoutModal?.priceLabel ?? ""}
          teamSummaryLine={checkoutModal?.teamSummaryLine || undefined}
          onSubmit={handleGuestCheckout}
          loading={checkoutLoading}
          error={checkoutError}
        />

        {/* Footer note */}
        <p className="mt-8 text-center text-sm text-neutral-500">
          AES-256 encryption at rest and in transit on every plan, always ·
          30-day money-back guarantee · Cancel anytime
        </p>
        <p className="mt-2 text-center text-xs text-neutral-400">
          Annual discount applies to base plan, team seat tiers, and team seat
          prices (add-on Power Ups stay monthly on the bill).
        </p>
      </div>
    </section>
  );
}
