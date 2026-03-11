"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  BIZZI_BYTE_COLORS,
  freeTier,
  plans,
  powerUpAddons,
  PLAN_LABELS,
  ADDON_LABELS,
} from "@/lib/pricing-data";
import CheckoutModal from "@/components/CheckoutModal";

function PlanCard({
  plan,
  minBadgeHeight,
  onSelect,
}: {
  plan: (typeof plans)[0];
  minBadgeHeight: string;
  onSelect?: (planId: string) => void;
}) {
  const accent = plan.accentColor;
  return (
    <div
      className="relative flex h-full flex-col rounded-2xl border-2 bg-white p-6 transition-all duration-200 hover:shadow-lg"
      style={{
        borderColor: plan.popular ? accent : accent + "50",
        boxShadow: plan.popular
          ? `0 10px 15px -3px ${accent}25, 0 0 0 2px ${accent}30`
          : undefined,
      }}
    >
      {/* Badge row - fixed height for alignment */}
      <div
        className="mb-3 flex items-center"
        style={{ minHeight: minBadgeHeight }}
      >
        {plan.popular ? (
          <span
            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: accent }}
          >
            {plan.tagline}
          </span>
        ) : (
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
            style={{ backgroundColor: accent + "15", color: accent }}
          >
            {plan.tagline}
          </span>
        )}
      </div>
      <h3 className="text-xl font-semibold text-neutral-900">{plan.name}</h3>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-bold text-neutral-900">
          ${plan.price}
        </span>
        <span className="text-base font-normal text-neutral-500">/mo</span>
      </div>
      <p className="mt-0.5 text-sm text-neutral-500">
        or ${plan.annualPrice}/yr — save 25%
      </p>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-sm font-medium text-neutral-500">Storage</span>
        <span className="text-lg font-semibold text-neutral-900">
          {plan.storage}
        </span>
      </div>
      <ul className="mt-4 flex-grow space-y-1.5 text-sm text-neutral-700">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span className="shrink-0" style={{ color: accent }}>
              ✓
            </span>
            {f}
          </li>
        ))}
      </ul>
      {plan.limitations && plan.limitations.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-neutral-500">
          {plan.limitations.map((l) => (
            <li key={l}>— {l}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-neutral-500">{plan.addOnsNote}</p>
      <button
        type="button"
        className="mt-6 w-full py-3 px-4 rounded-xl font-medium text-white transition-colors hover:opacity-90"
        style={{ backgroundColor: accent }}
        onClick={() => onSelect?.(plan.id)}
      >
        {plan.cta}
      </button>
    </div>
  );
}

function AddonCard({
  addon,
  minBadgeHeight,
}: {
  addon: (typeof powerUpAddons)[0];
  minBadgeHeight: string;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white transition-shadow hover:shadow-md">
      <div
        className="h-1 w-full shrink-0"
        style={{ backgroundColor: addon.accentColor }}
      />
      <div className="flex flex-grow flex-col p-6">
        <div
          className="flex items-center"
          style={{ minHeight: minBadgeHeight }}
        >
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: addon.accentColor }}
          >
            {addon.tagline}
          </span>
        </div>
        <h4
          className="text-lg font-bold text-neutral-900"
          style={{ color: addon.accentColor }}
        >
          {addon.name}
        </h4>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
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
        <ul className="mt-4 flex-grow space-y-1.5 text-sm text-neutral-700">
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
        <p className="mt-4 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
          Available on <strong>all paid plans</strong>
        </p>
      </div>
    </div>
  );
}

export default function PricingSection() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedAddonId, setSelectedAddonId] = useState<string | null>(null);
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
  } | null>(null);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const selectedAddon = powerUpAddons.find((a) => a.id === selectedAddonId);
  const total =
    selectedPlan && selectedAddon
      ? selectedPlan.price + selectedAddon.price
      : selectedPlan
        ? selectedBilling === "annual"
          ? selectedPlan.annualPrice / 12
          : selectedPlan.price
        : 0;

  const handleCheckout = useCallback(
    async (planId: string, addonId: string | null, billing: "monthly" | "annual") => {
      if (!user) {
        const plan = plans.find((p) => p.id === planId);
        const addon = addonId
          ? powerUpAddons.find((a) => a.id === addonId)
          : null;
        const priceLabel =
          plan && billing === "annual"
            ? `$${plan.annualPrice}/yr`
            : plan
              ? `$${plan.price}/mo`
              : "";
        setCheckoutModal({
          planId,
          planName: plan?.name ?? PLAN_LABELS[planId] ?? planId,
          addonId,
          addonName: addon?.name ?? (addonId ? ADDON_LABELS[addonId] : undefined),
          billing,
          priceLabel: addon
            ? `${priceLabel} + $${addon.price}/mo add-on`
            : priceLabel,
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
          billing === "annual" ? "annual" : "monthly"
        );
      }
    }
  }, [searchParams, user, handleCheckout]);

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
      className="scroll-mt-16 bg-neutral-50/50 px-6 py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">
            Storage that scales with your craft
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-neutral-600">
            Pick your storage. Add what you need. AES-256 encryption on every
            plan, always.
          </p>
        </div>

        {/* Free Tier */}
        <div className="mb-12">
          <div
            className="rounded-2xl border-2 bg-white p-6 shadow-lg md:p-8"
            style={{
              borderColor: freeTier.accentColor + "40",
              background: `linear-gradient(to bottom right, ${freeTier.accentColor}08, white)`,
              boxShadow: `0 10px 15px -3px ${freeTier.accentColor}15`,
            }}
          >
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="flex-1">
                <div className="mb-3" style={{ minHeight: BADGE_MIN_H }}>
                  <span
                    className="inline-block rounded-full px-3 py-1 text-xs font-semibold"
                    style={{
                      backgroundColor: freeTier.accentColor + "20",
                      color: freeTier.accentColor,
                    }}
                  >
                    {freeTier.tagline}
                  </span>
                </div>
                <h3 className="text-2xl font-semibold text-neutral-900">
                  {freeTier.name}
                </h3>
                <p className="mt-1 text-neutral-600">{freeTier.description}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-neutral-900">$0</span>
                  <span className="text-base font-normal text-neutral-500">
                    /mo
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-neutral-500">
                  {freeTier.subtext}
                </p>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-sm font-medium text-neutral-500">
                    Cloud Storage
                  </span>
                  <span className="text-lg font-semibold text-neutral-900">
                    {freeTier.storage}
                  </span>
                </div>
                <ul className="mt-4 space-y-1.5 text-sm text-neutral-700">
                  {freeTier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span
                        className="shrink-0"
                        style={{ color: freeTier.accentColor }}
                      >
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <ul className="mt-3 space-y-1 text-sm text-neutral-500">
                  {freeTier.limitations.map((l) => (
                    <li key={l}>— {l}</li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-neutral-500">
                  {freeTier.addOnsNote}
                </p>
                <a
                  href="#paid-plans"
                  className="mt-6 inline-block w-full rounded-xl px-8 py-3 font-medium text-center text-white transition-colors hover:opacity-90 md:w-auto"
                  style={{ backgroundColor: freeTier.accentColor }}
                >
                  Choose a paid plan below
                </a>
              </div>
            </div>
          </div>
        </div>

        {checkoutError && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            {checkoutError}
          </div>
        )}

        {/* 4 Base Plans */}
        <div id="paid-plans" className="scroll-mt-24 mb-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              minBadgeHeight={BADGE_MIN_H}
              onSelect={() => handleCheckout(plan.id, null, "monthly")}
            />
          ))}
        </div>

        {/* Power Up Add-ons */}
        <div className="mb-16">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-neutral-900">
              Power up any plan
            </h3>
            <p className="mt-0.5 text-sm text-neutral-500">
              Add only what your workflow needs. Available on every paid plan
              (except free).
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Stack freely. Cancel anytime. Add-ons billed monthly.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {powerUpAddons.map((addon) => (
              <AddonCard
                key={addon.id}
                addon={addon}
                minBadgeHeight={BADGE_MIN_H}
              />
            ))}
          </div>
        </div>

        {/* Build your plan calculator */}
        <div className="mb-16 rounded-2xl border border-neutral-200 bg-white p-6 md:p-8">
          <h3 className="text-lg font-bold text-neutral-900">
            Build your plan
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            Select a base plan and optional Power Up to see your total.
          </p>
          <div className="mt-6 flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">
                Base plan
              </label>
              <select
                value={selectedPlanId ?? ""}
                onChange={(e) =>
                  setSelectedPlanId(e.target.value || null)
                }
                className="rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-900 outline-none focus:border-bizzi-blue"
              >
                <option value="">Choose plan…</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — ${p.price}/mo ({p.storage})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">
                Power Up add-on
              </label>
              <select
                value={selectedAddonId ?? ""}
                onChange={(e) =>
                  setSelectedAddonId(e.target.value || null)
                }
                className="rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-900 outline-none focus:border-bizzi-blue"
              >
                <option value="">No add-on</option>
                {powerUpAddons.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — +${a.price}/mo
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">
                Billing
              </label>
              <select
                value={selectedBilling}
                onChange={(e) =>
                  setSelectedBilling(e.target.value as "monthly" | "annual")
                }
                className="rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-900 outline-none focus:border-bizzi-blue"
              >
                <option value="monthly">Monthly</option>
                <option value="annual">Annual (save 25%)</option>
              </select>
            </div>
            {selectedPlan && (
              <div className="flex items-end gap-4">
                <div className="flex items-baseline gap-2 rounded-lg bg-neutral-50 px-4 py-3">
                  <span className="text-sm text-neutral-500">
                    {selectedPlan.id === "solo" || selectedPlan.id === "indie" || selectedPlan.id === "video" || selectedPlan.id === "production"
                      ? selectedBilling === "annual"
                        ? `$${selectedPlan.annualPrice}/yr`
                        : `$${selectedPlan.price}/mo`
                      : `$${selectedPlan.price}/mo`}
                    {selectedAddon && ` + $${selectedAddon.price}/mo`}
                  </span>
                  <span className="text-xl font-bold text-neutral-900">
                    = ${Math.round(total)}/mo
                  </span>
                </div>
                <button
                  type="button"
                  disabled={checkoutLoading}
                  onClick={() =>
                    handleCheckout(
                      selectedPlan.id,
                      selectedAddonId,
                      selectedBilling
                    )
                  }
                  className="rounded-xl bg-bizzi-blue px-6 py-3 font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
                >
                  {checkoutLoading ? "Redirecting…" : "Subscribe"}
                </button>
              </div>
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
                Custom storage, unlimited seats, dedicated infrastructure and
                SLA-backed uptime. All add-ons included. Built for agencies,
                post-houses and broadcast studios.
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="grid grid-cols-3 gap-4">
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
                    Unlimited
                  </span>
                  <span className="mt-0.5 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Team Seats
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
          Annual discount applies to base plan price only. Add-ons billed
          monthly.
        </p>
      </div>
    </section>
  );
}
