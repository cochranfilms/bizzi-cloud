"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useAuth } from "@/context/AuthContext";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import { signInWithGooglePopup } from "@/lib/firebase/google-sign-in";
import { trackCheckoutFunnelEvent } from "@/lib/checkout-funnel-analytics";
import { plans, powerUpAddons, PLAN_LABELS, ADDON_LABELS, planAllowsPersonalTeamSeats } from "@/lib/pricing-data";
import {
  emptyTeamSeatCounts,
  sumExtraTeamSeats,
  teamSeatMonthlySubtotal,
  teamSeatsAnnualUsdTotal,
  type TeamSeatCounts,
} from "@/lib/team-seat-pricing";
import CheckoutModal, {
  type CheckoutModalLoadingPhase,
} from "@/components/CheckoutModal";
import FreeSignUpModal from "@/components/FreeSignUpModal";
import BuildPlanConfigurator, {
  type PlanBuilderCheckoutPayload,
} from "@/components/pricing/BuildPlanConfigurator";
import PowerUpProductTiles from "@/components/pricing/PowerUpProductTiles";
import LandingCheckoutSeatsModal from "@/components/pricing/LandingCheckoutSeatsModal";
import { productSettingsCopy } from "@/lib/product-settings-copy";

const CHECKOUT_START_FAILED_MSG =
  "We couldn't start secure checkout. Try again below, or use the login page later to finish your purchase.";

export default function PricingSection() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutModalLoadingPhase, setCheckoutModalLoadingPhase] =
    useState<CheckoutModalLoadingPhase>("idle");
  const [guestEmailInUse, setGuestEmailInUse] = useState(false);
  const [checkoutRecoveryAfterSignup, setCheckoutRecoveryAfterSignup] =
    useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const purchaseProcessedRef = useRef(false);
  const [checkoutModal, setCheckoutModal] = useState<{
    planId: string;
    planName: string;
    addonIds: string[];
    addonName?: string;
    billing: "monthly" | "annual";
    priceLabel: string;
    teamSummaryLine?: string;
    teamSeatCounts: TeamSeatCounts;
  } | null>(null);
  const [checkoutSeatsOpen, setCheckoutSeatsOpen] = useState(false);
  const [pendingLandingPayload, setPendingLandingPayload] =
    useState<PlanBuilderCheckoutPayload | null>(null);

  const buildGuestPriceLabel = useCallback((payload: PlanBuilderCheckoutPayload) => {
    const tier = plans.find((t) => t.id === payload.planId);
    const priceLabel =
      tier && payload.billing === "annual"
        ? `$${tier.annualPrice}/yr`
        : tier
          ? `$${tier.price}/mo`
          : "";
    let label = priceLabel;
    if (payload.addonIds.length > 0) {
      const addonMonthly = payload.addonIds.reduce((sum, id) => {
        const a = powerUpAddons.find((x) => x.id === id);
        return sum + (a?.price ?? 0);
      }, 0);
      label += ` + ~$${addonMonthly}/mo ${productSettingsCopy.powerUps.label}`;
    }
    const seats = sumExtraTeamSeats(payload.teamSeatCounts);
    if (seats > 0 && planAllowsPersonalTeamSeats(payload.planId)) {
      if (payload.billing === "monthly") {
        label += ` + ~$${teamSeatMonthlySubtotal(payload.teamSeatCounts)}/mo seats`;
      } else {
        label += ` + ~$${teamSeatsAnnualUsdTotal(payload.teamSeatCounts)}/yr seats`;
      }
    }
    return label;
  }, []);

  const runAuthenticatedLandingCheckout = useCallback(
    async (payload: PlanBuilderCheckoutPayload) => {
      setCheckoutLoading(true);
      setCheckoutError(null);
      try {
        const token = await getFirebaseAuth().currentUser?.getIdToken(true);
        if (!token) {
          setCheckoutError("Session expired. Please sign in again.");
          return;
        }
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const teamSeatCounts = planAllowsPersonalTeamSeats(payload.planId)
          ? payload.teamSeatCounts
          : emptyTeamSeatCounts();
        const res = await fetch(`${base}/api/stripe/checkout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            planId: payload.planId,
            addonIds: payload.addonIds,
            billing: payload.billing,
            teamSeatCounts,
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
    []
  );

  const handleLandingSubscribe = useCallback((payload: PlanBuilderCheckoutPayload) => {
    setCheckoutError(null);
    setPendingLandingPayload(payload);
    setCheckoutSeatsOpen(true);
  }, []);

  const handleLandingFinishAndPay = useCallback(
    async (teamSeatCounts: TeamSeatCounts) => {
      if (!pendingLandingPayload) return;
      const final: PlanBuilderCheckoutPayload = {
        ...pendingLandingPayload,
        teamSeatCounts: planAllowsPersonalTeamSeats(pendingLandingPayload.planId)
          ? teamSeatCounts
          : emptyTeamSeatCounts(),
      };

      if (!user) {
        setCheckoutSeatsOpen(false);
        setPendingLandingPayload(null);
        const tier = plans.find((t) => t.id === final.planId);
        const addonName =
          final.addonIds.length > 0
            ? final.addonIds.map((id) => ADDON_LABELS[id] ?? id).join(", ")
            : undefined;
        const seatN = sumExtraTeamSeats(final.teamSeatCounts);
        setGuestEmailInUse(false);
        setCheckoutRecoveryAfterSignup(false);
        setCheckoutModalLoadingPhase("idle");
        setCheckoutModal({
          planId: final.planId,
          planName: tier?.name ?? PLAN_LABELS[final.planId] ?? final.planId,
          addonIds: final.addonIds,
          addonName,
          billing: final.billing,
          priceLabel: buildGuestPriceLabel(final),
          teamSummaryLine:
            seatN > 0 && planAllowsPersonalTeamSeats(final.planId)
              ? final.billing === "monthly"
                ? `Personal team seats: ~$${teamSeatMonthlySubtotal(final.teamSeatCounts)}/mo for ${seatN} extra seat${seatN !== 1 ? "s" : ""}`
                : `Personal team seats: ~$${teamSeatsAnnualUsdTotal(final.teamSeatCounts)}/yr for ${seatN} extra seat${seatN !== 1 ? "s" : ""}`
              : undefined,
          teamSeatCounts: final.teamSeatCounts,
        });
        return;
      }

      await runAuthenticatedLandingCheckout(final);
    },
    [pendingLandingPayload, user, buildGuestPriceLabel, runAuthenticatedLandingCheckout]
  );

  const handleCheckoutSeatsClose = useCallback(() => {
    if (checkoutLoading) return;
    setCheckoutSeatsOpen(false);
    setPendingLandingPayload(null);
  }, [checkoutLoading]);

  const handleRetryGuestCheckout = useCallback(async () => {
    if (!checkoutModal) return;
    setCheckoutError(null);
    const payload: PlanBuilderCheckoutPayload = {
      planId: checkoutModal.planId,
      addonIds: checkoutModal.addonIds,
      billing: checkoutModal.billing,
      storageAddonId: null,
      teamSeatCounts: checkoutModal.teamSeatCounts,
    };
    await runAuthenticatedLandingCheckout(payload);
  }, [checkoutModal, runAuthenticatedLandingCheckout]);

  const completeCheckoutAfterGuestAuth = useCallback(async (): Promise<{
    redirected: boolean;
  }> => {
    if (!checkoutModal) return { redirected: false };
    const token = await getFirebaseAuth().currentUser?.getIdToken(true);
    if (!token) {
      trackCheckoutFunnelEvent("checkout_recovery_needed");
      setCheckoutRecoveryAfterSignup(true);
      setCheckoutError(
        "Could not verify your session. Try again below or sign in from the login page."
      );
      return { redirected: false };
    }
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const res = await fetch(`${base}/api/stripe/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        planId: checkoutModal.planId,
        addonIds: checkoutModal.addonIds,
        billing: checkoutModal.billing,
        teamSeatCounts: checkoutModal.teamSeatCounts,
      }),
    });
    const result = (await res.json()) as { url?: string; error?: string };
    trackCheckoutFunnelEvent("checkout_session_created", { ok: res.ok });

    if (!res.ok) {
      trackCheckoutFunnelEvent("checkout_recovery_needed");
      setCheckoutRecoveryAfterSignup(true);
      setCheckoutError(CHECKOUT_START_FAILED_MSG);
      return { redirected: false };
    }
    if (result.url) {
      trackCheckoutFunnelEvent("redirected_to_stripe");
      window.location.href = result.url;
      return { redirected: true };
    }
    trackCheckoutFunnelEvent("checkout_recovery_needed");
    setCheckoutRecoveryAfterSignup(true);
    setCheckoutError(CHECKOUT_START_FAILED_MSG);
    return { redirected: false };
  }, [checkoutModal]);

  const handleGuestGoogleCheckout = useCallback(async () => {
    if (!checkoutModal) return;
    setCheckoutLoading(true);
    setCheckoutError(null);
    setCheckoutRecoveryAfterSignup(false);
    setGuestEmailInUse(false);
    setCheckoutModalLoadingPhase("signing_in_with_google");
    trackCheckoutFunnelEvent("signup_started");

    let redirected = false;
    try {
      await signInWithGooglePopup();
      trackCheckoutFunnelEvent("signup_created_account");
      setCheckoutModalLoadingPhase("redirecting_checkout");
      const { redirected: r } = await completeCheckoutAfterGuestAuth();
      redirected = r;
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request"
      ) {
        setCheckoutError(null);
      } else if (code === "auth/popup-blocked") {
        setCheckoutError(
          "Your browser blocked the Google sign-in popup. Allow popups for this site and try again."
        );
      } else if (code === "auth/account-exists-with-different-credential") {
        setCheckoutError(
          "This email already uses password sign-in. Sign in with email and password, then subscribe from Pricing while signed in."
        );
      } else if (code === "auth/operation-not-allowed") {
        setCheckoutError("Google sign-in is not available. Continue with email below.");
      } else {
        setCheckoutError("Google sign-in failed. Please try again or use email below.");
      }
    } finally {
      if (!redirected) {
        setCheckoutLoading(false);
        setCheckoutModalLoadingPhase("idle");
      }
    }
  }, [checkoutModal, completeCheckoutAfterGuestAuth]);

  const handleGuestCheckout = useCallback(
    async (data: { name: string; email: string; password: string }) => {
      if (!checkoutModal) return;
      setCheckoutLoading(true);
      setCheckoutError(null);
      setCheckoutRecoveryAfterSignup(false);
      setGuestEmailInUse(false);
      setCheckoutModalLoadingPhase("creating_account");
      trackCheckoutFunnelEvent("signup_started");

      let redirected = false;
      try {
        const auth = getFirebaseAuth();
        const credential = await createUserWithEmailAndPassword(
          auth,
          data.email,
          data.password
        );
        // Auth display name only; Firestore profile + plan data come from the Stripe webhook when userId is on the session.
        await updateProfile(credential.user, { displayName: data.name });
        trackCheckoutFunnelEvent("signup_created_account");

        setCheckoutModalLoadingPhase("redirecting_checkout");
        const { redirected: r } = await completeCheckoutAfterGuestAuth();
        redirected = r;
      } catch (err: unknown) {
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code?: string }).code)
            : "";
        if (code === "auth/email-already-in-use") {
          trackCheckoutFunnelEvent("email_already_in_use_hit");
          setGuestEmailInUse(true);
          setCheckoutError(null);
          return;
        }
        setCheckoutError("Something went wrong. Please try again.");
      } finally {
        if (!redirected) {
          setCheckoutLoading(false);
          setCheckoutModalLoadingPhase("idle");
        }
      }
    },
    [checkoutModal, completeCheckoutAfterGuestAuth]
  );

  useEffect(() => {
    const purchase = searchParams.get("purchase");
    const addon = searchParams.get("addon");
    const billing = searchParams.get("billing");
    if (purchase && user && !purchaseProcessedRef.current) {
      const validPlans = ["solo", "indie", "video", "production"];
      if (validPlans.includes(purchase)) {
        purchaseProcessedRef.current = true;
        void handleLandingSubscribe({
          planId: purchase,
          addonIds:
            addon && ["gallery", "editor", "fullframe"].includes(addon) ? [addon] : [],
          billing: billing === "annual" ? "annual" : "monthly",
          storageAddonId: null,
          teamSeatCounts: emptyTeamSeatCounts(),
        });
      }
    }
  }, [searchParams, user, handleLandingSubscribe]);

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

  return (
    <section
      id="pricing"
      className="scroll-mt-28 px-6 py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-20 px-2 text-center md:mb-24">
          <h2 className="mx-auto mb-6 max-w-4xl text-4xl font-bold leading-[1.08] tracking-tight text-bizzi-navy dark:text-sky-50 md:text-5xl md:leading-[1.06]">
            The creator&apos;s workspace in the cloud
          </h2>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-neutral-600 dark:text-neutral-300 md:text-lg md:leading-relaxed">
            Bizzi Cloud Power Ups are designed to optimize post production from
            the storage layer up.
          </p>
        </div>

        {checkoutError && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-200">
            {checkoutError}
          </div>
        )}

        {/* Power Ups — product-style tiles (summaries on hover / + control) */}
        <div className="mb-20 md:mb-24">
          <PowerUpProductTiles
            addons={powerUpAddons.map(
              ({ id, name, price, accentColor, bundleNote }) => ({
                id,
                name,
                price,
                accentColor,
                bundleNote,
              })
            )}
          />
          <p className="mx-auto mt-12 max-w-lg text-center text-xs leading-relaxed text-neutral-500 dark:text-neutral-400 md:mt-14">
            Stack freely. Cancel anytime. Add-ons billed monthly.
          </p>
        </div>

        {/* Plan builder — same UI as dashboard Change Plan; extra TB add-ons only in settings */}
        <div
          id="paid-plans"
          className="scroll-mt-24 mb-16 rounded-2xl border border-neutral-200 bg-white p-6 md:p-8 dark:border-neutral-700 dark:bg-neutral-900"
        >
          <BuildPlanConfigurator
            mode="landing"
            showAdditionalStorage={false}
            title="Build your plan"
            subtitle="Same configurator as in your account. Extra storage add-ons are available after you subscribe in Settings."
            onLandingSubscribe={handleLandingSubscribe}
            landingSubscribeLoading={checkoutLoading}
            landingError={checkoutError}
          />
          <p className="mt-8 border-t border-neutral-200 pt-6 text-center text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
            Just need 2&nbsp;GB?{" "}
            <button
              type="button"
              onClick={() => (user ? router.push("/dashboard") : setFreeSignUpModalOpen(true))}
              className="font-medium text-bizzi-blue hover:underline dark:text-bizzi-cyan"
            >
              {user ? "Go to Dashboard" : "Get started free"}
            </button>
          </p>
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
                    15 TB+
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
                    Team Seats ($10/seat)
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
        <LandingCheckoutSeatsModal
          open={checkoutSeatsOpen && !!pendingLandingPayload}
          payload={pendingLandingPayload}
          loading={checkoutLoading}
          error={checkoutError}
          onClose={handleCheckoutSeatsClose}
          onFinishAndPay={(seats) => void handleLandingFinishAndPay(seats)}
        />
        <CheckoutModal
          isOpen={!!checkoutModal}
          onClose={() => {
            if (checkoutLoading) return;
            setCheckoutModal(null);
            setCheckoutError(null);
            setGuestEmailInUse(false);
            setCheckoutRecoveryAfterSignup(false);
            setCheckoutModalLoadingPhase("idle");
          }}
          planId={checkoutModal?.planId ?? ""}
          planName={checkoutModal?.planName ?? ""}
          addonId={null}
          addonName={checkoutModal?.addonName}
          billing={checkoutModal?.billing ?? "monthly"}
          priceLabel={checkoutModal?.priceLabel ?? ""}
          teamSummaryLine={checkoutModal?.teamSummaryLine}
          onSubmit={handleGuestCheckout}
          loading={checkoutLoading}
          loadingPhase={checkoutModalLoadingPhase}
          error={checkoutError}
          emailInUse={guestEmailInUse}
          checkoutRecovery={checkoutRecoveryAfterSignup}
          onRetryCheckout={handleRetryGuestCheckout}
          onGoogleCheckout={
            isFirebaseConfigured() ? handleGuestGoogleCheckout : undefined
          }
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
