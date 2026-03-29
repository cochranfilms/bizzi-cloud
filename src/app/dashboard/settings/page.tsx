"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/dashboard/TopBar";
import { useProfileUpdate } from "@/hooks/useProfileUpdate";
import { useSubscription } from "@/hooks/useSubscription";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useAuth } from "@/context/AuthContext";
import {
  CreditCard,
  Loader2,
  Check,
  ExternalLink,
  HardDrive,
  Shield,
  Download,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import StorageAnalyticsPage from "@/components/dashboard/storage/StorageAnalyticsPage";
import { useDesktopMode } from "@/hooks/useDesktopMode";
import {
  PLAN_LABELS,
  ADDON_LABELS,
  STORAGE_ADDON_LABELS,
  planAllowsPersonalTeamSeats,
  type StorageAddonId,
} from "@/lib/pricing-data";
import {
  sumExtraTeamSeats,
  TEAM_SEAT_MONTHLY_USD,
  PERSONAL_TEAM_SEAT_ACCESS_LABELS,
} from "@/lib/team-seat-pricing";
import { TeamManagementSection } from "@/components/dashboard/TeamManagementSection";
import { ColdStorageAlertBanner } from "@/components/dashboard/ColdStorageAlertBanner";
import DashboardRouteFade from "@/components/dashboard/DashboardRouteFade";
import SettingsScopeHeader from "@/components/settings/SettingsScopeHeader";
import SettingsSectionScope from "@/components/settings/SettingsSectionScope";
import WhereToChangeHint from "@/components/settings/WhereToChangeHint";
import { productSettingsCopy } from "@/lib/product-settings-copy";
import PersonalProfileSettingsSection from "@/components/settings/PersonalProfileSettingsSection";
import PersonalCredentialsSection from "@/components/settings/PersonalCredentialsSection";

const WEB_APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.bizzicloud.io";

function StorageSection() {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <SettingsSectionScope label={productSettingsCopy.scopes.personalAccountOnly} />
      <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
        <HardDrive className="h-5 w-5 text-bizzi-blue" />
        Storage
      </h2>
      <StorageAnalyticsPage basePath="/dashboard" />
    </section>
  );
}

function PrivacySection() {
  const { user } = useAuth();
  const { org } = useEnterprise();
  const [doNotSell, setDoNotSell] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [functional, setFunctional] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [ownsOrg, setOwnsOrg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchAccountStatus = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/account/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOwnsOrg(data.owns_org ?? false);
      }
    } catch {
      setOwnsOrg(false);
    }
  }, [user]);

  const fetchPrivacy = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/account/privacy", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDoNotSell(data.do_not_sell_personal_info ?? false);
        const cc = data.cookie_consent ?? {};
        setAnalytics(cc.analytics ?? false);
        setFunctional(cc.functional ?? false);
      }
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    fetchPrivacy();
  }, [fetchPrivacy]);

  useEffect(() => {
    fetchAccountStatus();
  }, [fetchAccountStatus]);

  const handleSavePrivacy = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/account/privacy", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          do_not_sell_personal_info: doNotSell,
          cookie_consent: { essential: true, analytics, functional },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSuccess("Privacy preferences saved.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!user) return;
    setExportLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/account/export", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bizzi-cloud-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess("Data exported. Download started.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirm !== "DELETE") return;
    setDeleteLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      const data = (await res.json()) as {
        error?: string;
        hasEnterpriseAccess?: boolean;
        ownsOrg?: boolean;
      };
      if (!res.ok) throw new Error(data.error ?? "Deletion failed");
      setDeleteModalOpen(false);
      setDeleteConfirm("");
      if (data.hasEnterpriseAccess) {
        router.push("/account/personal-deleted");
        router.refresh();
      } else {
        const { signOut } = await import("firebase/auth");
        const { getFirebaseAuth } = await import("@/lib/firebase/client");
        await signOut(getFirebaseAuth());
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deletion failed");
    } finally {
      setDeleteLoading(false);
    }
  };

  const router = useRouter();
  const hasEnterpriseAccess = !!org;

  return (
    <section
      id="privacy"
      className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900"
    >
      <SettingsSectionScope label={productSettingsCopy.scopes.personalAccountOnly} />
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
        <Shield className="h-5 w-5 text-bizzi-blue" />
        Privacy
      </h2>
      <div className="space-y-6">
        <div>
          <h3 className="mb-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
            Do Not Sell My Personal Information (CCPA)
          </h3>
          <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
            Bizzi Cloud does not sell your data. California residents can opt out of any future sale or sharing.
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={doNotSell}
              onChange={(e) => setDoNotSell(e.target.checked)}
              className="rounded border-neutral-300 text-bizzi-blue focus:ring-bizzi-blue"
            />
            <span className="text-sm">Opt out of sale/sharing of my personal information</span>
          </label>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
            Cookie preferences
          </h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={true}
                disabled
                className="rounded border-neutral-300 text-bizzi-blue"
              />
              <span className="text-sm">Essential (required)</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                className="rounded border-neutral-300 text-bizzi-blue focus:ring-bizzi-blue"
              />
              <span className="text-sm">Analytics</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={functional}
                onChange={(e) => setFunctional(e.target.checked)}
                className="rounded border-neutral-300 text-bizzi-blue focus:ring-bizzi-blue"
              />
              <span className="text-sm">Functional</span>
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSavePrivacy}
            disabled={loading}
            className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan disabled:opacity-70"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save preferences"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {success && (
          <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" /> {success}
          </p>
        )}
        <div className="border-t border-neutral-200 pt-6 dark:border-neutral-700">
          <h3 className="mb-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
            Your data rights
          </h3>
          {ownsOrg && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                You still administer an organization. Transfer ownership or delete the organization
                before closing your identity.
              </p>
              <Link
                href="/enterprise/seats"
                className="mt-2 inline-block text-sm font-medium text-amber-700 underline hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
              >
                Go to organization seats to transfer ownership
              </Link>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExport}
              disabled={exportLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium dark:border-neutral-700 dark:text-neutral-300"
            >
              {exportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download my data
            </button>
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              disabled={ownsOrg}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <Trash2 className="h-4 w-4" />
              {hasEnterpriseAccess ? "Delete personal account" : "Delete my account"}
            </button>
          </div>
        </div>
      </div>
      {deleteModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
              {hasEnterpriseAccess ? "Delete personal account" : "Delete account"}
            </h3>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              {hasEnterpriseAccess ? (
                <>
                  Your personal workspace will be deleted and is recoverable for 30 days. Your
                  enterprise workspace access will remain active. You can continue to sign in
                  and use your team storage, or restore your personal account within the grace period.
                </>
              ) : (
                <>
                  Your account is scheduled for permanent deletion on{" "}
                  {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                  . Until then, your files remain recoverable. Log back in and resubscribe to restore them.
                </>
              )}
            </p>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Type <strong>DELETE</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="mt-2 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteConfirm("");
                }}
                className="flex-1 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium dark:border-neutral-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteLoading || deleteConfirm !== "DELETE"}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : hasEnterpriseAccess ? (
                  "Delete personal account"
                ) : (
                  "Delete account"
                )}
              </button>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </section>
  );
}

function SubscriptionSection() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDesktop = useDesktopMode();
  const {
    planId,
    addonIds,
    storageAddonId,
    hasPortalAccess,
    loading,
    refetch,
    teamSeatCounts,
    ownsPersonalTeam,
  } = useSubscription();
  const [teamSeatUsage, setTeamSeatUsage] = useState<{
    used: number;
    purchased: number;
  } | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const [showConfirmationBanner, setShowConfirmationBanner] = useState(false);
  const [confirmationType, setConfirmationType] = useState<"updated" | "cancelled" | "purchase" | null>(null);
  const [powerUpWarningModalOpen, setPowerUpWarningModalOpen] = useState(false);
  const [powerUpCheckLoading, setPowerUpCheckLoading] = useState(false);

  const teamSeatsEligible =
    planAllowsPersonalTeamSeats(planId ?? "free") && ownsPersonalTeam;
  const purchasedTeamSeats = sumExtraTeamSeats(teamSeatCounts);
  const teamManagementSettingsHref =
    user && purchasedTeamSeats > 0
      ? `/team/${user.uid}/settings#team-management`
      : "/dashboard/settings#team-management";

  useEffect(() => {
    if (!user || !teamSeatsEligible || loading) {
      setTeamSeatUsage(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/personal-team/members", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          overview?: { used: Record<string, number>; team_seat_counts: Record<string, number> };
        };
        const u = data.overview?.used;
        const p = data.overview?.team_seat_counts;
        if (!u || !p || cancelled) return;
        const used =
          (u.none ?? 0) + (u.gallery ?? 0) + (u.editor ?? 0) + (u.fullframe ?? 0);
        const purch =
          (p.none ?? 0) + (p.gallery ?? 0) + (p.editor ?? 0) + (p.fullframe ?? 0);
        setTeamSeatUsage({ used, purchased: purch });
      } catch {
        if (!cancelled) setTeamSeatUsage(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, teamSeatsEligible, loading, planId, purchasedTeamSeats]);

  useEffect(() => {
    if (!user) return;
    const updated = searchParams.get("updated") === "subscription";
    const cancelled = searchParams.get("cancelled") === "subscription";
    const purchaseConfirmed = searchParams.get("purchase_confirmed") === "1" || searchParams.get("checkout") === "success";
    if (updated || cancelled || purchaseConfirmed) {
      refetch();
      const retry = setTimeout(() => refetch(), 2000);
      setConfirmationType(cancelled ? "cancelled" : purchaseConfirmed ? "purchase" : "updated");
      setShowConfirmationBanner(true);
      router.replace(isDesktop ? "/desktop/app/settings" : "/dashboard/settings", { scroll: false });
      return () => clearTimeout(retry);
    }
  }, [user, searchParams, refetch, router, isDesktop]);

  const syncFromStripe = async () => {
    if (!user) return;
    setSyncLoading(true);
    setPortalError(null);
    try {
      const token = await user.getIdToken(true);
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/stripe/sync-by-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        await refetch();
      } else {
        setPortalError(data.error ?? "No subscription found");
      }
    } catch {
      setPortalError("Failed to sync");
    } finally {
      setSyncLoading(false);
    }
  };

  const handleChangePlanClick = async () => {
    if (!user) return;
    setPowerUpCheckLoading(true);
    try {
      const token = await user.getIdToken(true);
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/storage/powerup-files-check`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { hasRawFiles?: boolean; hasGalleryMediaFiles?: boolean };
      const hasAtRiskFiles =
        (data.hasRawFiles || data.hasGalleryMediaFiles) === true;
      if (hasAtRiskFiles && (addonIds.includes("editor") || addonIds.includes("gallery") || addonIds.includes("fullframe"))) {
        setPowerUpWarningModalOpen(true);
      } else {
        navigateToChangePlan();
      }
    } catch {
      navigateToChangePlan();
    } finally {
      setPowerUpCheckLoading(false);
    }
  };

  const navigateToChangePlan = () => {
    if (isDesktop) {
      window.open(`${WEB_APP_URL}/dashboard/change-plan`, "_blank");
    } else {
      router.push("/dashboard/change-plan");
    }
  };

  const openPortal = async () => {
    if (!user) return;
    setPortalLoading(true);
    setPortalError(null);
    try {
      const token = await user.getIdToken();
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
        if (isDesktop) {
          window.open(data.url, "_blank");
        } else {
          window.location.href = data.url;
        }
      } else {
        setPortalError(data.error ?? "Failed to open billing portal");
      }
    } catch {
      setPortalError("Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  const planLabel = PLAN_LABELS[planId ?? "free"] ?? "Starter Free";

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <SettingsSectionScope label={productSettingsCopy.scopes.personalAccountOnly} />
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
        <CreditCard className="h-5 w-5 text-bizzi-blue" />
        {productSettingsCopy.billing.subscriptionAndBilling}
      </h2>
      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        Your paid plan, Power Ups, storage add-ons, and personal team seats are tied to this account.
      </p>
      <ColdStorageAlertBanner />
      {showConfirmationBanner && (
        <div
          className={`mb-4 flex items-start gap-3 rounded-lg border p-4 ${
            confirmationType === "cancelled"
              ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
              : "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
          }`}
        >
          <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
          <div className="min-w-0 flex-1">
            {confirmationType === "cancelled" ? (
              <>
                <p className="font-medium text-amber-900 dark:text-amber-100">
                  Subscription cancelled
                </p>
                <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                  Your plan will end at the close of your current billing period. You&apos;ll keep access until then.
                </p>
              </>
            ) : confirmationType === "purchase" ? (
              <>
                <p className="font-medium text-green-900 dark:text-green-100">
                  Welcome! Your purchase is complete
                </p>
                <p className="mt-1 text-sm text-green-800 dark:text-green-200">
                  Your plan is now active. Add Power Ups, storage, or personal team seats anytime from{" "}
                  <strong className="text-green-900 dark:text-green-100">
                    {productSettingsCopy.changePlan.label}
                  </strong>{" "}
                  or manage invites in team settings.
                </p>
                {!isDesktop ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href="/dashboard/change-plan"
                      className="inline-flex items-center justify-center rounded-lg bg-bizzi-blue px-3 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan"
                    >
                      {productSettingsCopy.changePlan.label}
                    </Link>
                    <Link
                      href={teamManagementSettingsHref}
                      className="inline-flex items-center justify-center rounded-lg border border-green-700/40 bg-white px-3 py-2 text-sm font-medium text-green-900 hover:bg-green-50 dark:border-green-600 dark:bg-neutral-900 dark:text-green-100 dark:hover:bg-green-950/40"
                    >
                      Team management
                    </Link>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p className="font-medium text-green-900 dark:text-green-100">
                  Plan updated successfully
                </p>
                <p className="mt-1 text-sm text-green-800 dark:text-green-200">
                  Your subscription changes have been applied. A prorated charge or credit has been applied to your account.
                </p>
              </>
            )}
            <button
              type="button"
              onClick={() => setShowConfirmationBanner(false)}
              className="mt-2 text-sm font-medium text-green-700 underline hover:no-underline dark:text-green-300"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-700 dark:bg-neutral-800/50">
        <DashboardRouteFade ready={!loading} srOnlyMessage="Loading subscription" compact>
          <div className="space-y-4">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Current plan: <strong className="text-neutral-900 dark:text-white">{planLabel}</strong>
            </p>
            {addonIds.length > 0 && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Power Ups:{" "}
                <span className="font-medium text-neutral-900 dark:text-white">
                  {addonIds.map((id) => ADDON_LABELS[id] ?? id).join(", ")}
                </span>
              </p>
            )}
            {storageAddonId && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Additional storage:{" "}
                <strong className="text-neutral-900 dark:text-white">
                  {STORAGE_ADDON_LABELS[storageAddonId as StorageAddonId] ?? storageAddonId}
                </strong>
              </p>
            )}
            {teamSeatsEligible && (
              <div className="rounded-lg border border-cyan-200/80 bg-cyan-50/60 p-4 dark:border-cyan-900/50 dark:bg-cyan-950/25">
                <p className="text-sm font-medium text-neutral-900 dark:text-white">Team seats</p>
                <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                  Personal team (not Organization). Extra seats are billed per access level.
                </p>
                <ul className="mt-2 space-y-0.5 text-xs text-neutral-600 dark:text-neutral-400">
                  <li>
                    {PERSONAL_TEAM_SEAT_ACCESS_LABELS.none}: ${TEAM_SEAT_MONTHLY_USD.none}/mo each
                  </li>
                  <li>
                    {PERSONAL_TEAM_SEAT_ACCESS_LABELS.gallery}: ${TEAM_SEAT_MONTHLY_USD.gallery}/mo each
                  </li>
                  <li>
                    {PERSONAL_TEAM_SEAT_ACCESS_LABELS.editor}: ${TEAM_SEAT_MONTHLY_USD.editor}/mo each
                  </li>
                  <li>
                    {PERSONAL_TEAM_SEAT_ACCESS_LABELS.fullframe}: ${TEAM_SEAT_MONTHLY_USD.fullframe}/mo each
                  </li>
                </ul>
                <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
                  Purchased extra seats:{" "}
                  <strong className="text-neutral-900 dark:text-white">{purchasedTeamSeats}</strong>
                  {teamSeatUsage && (
                    <>
                      {" "}
                      · In use (assigned + pending):{" "}
                      <strong className="text-neutral-900 dark:text-white">
                        {teamSeatUsage.used}
                      </strong>
                      {" · "}
                      Available:{" "}
                      <strong className="text-neutral-900 dark:text-white">
                        {Math.max(0, teamSeatUsage.purchased - teamSeatUsage.used)}
                      </strong>
                    </>
                  )}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/dashboard/change-plan"
                    className="inline-flex items-center rounded-lg bg-bizzi-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-bizzi-cyan"
                  >
                    Add or change team seats
                  </Link>
                  <Link
                    href={teamManagementSettingsHref}
                    className="inline-flex items-center rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-white dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  >
                    Team settings
                  </Link>
                </div>
              </div>
            )}
            {hasPortalAccess ? (
              <div className="flex flex-wrap items-center gap-3">
                {isDesktop ? (
                  <>
                    <button
                      type="button"
                      onClick={handleChangePlanClick}
                      disabled={powerUpCheckLoading}
                      className="inline-flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
                    >
                      {powerUpCheckLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ExternalLink className="h-4 w-4" />
                      )}
                      Manage subscription on web
                    </button>
                    <button
                      type="button"
                      onClick={openPortal}
                      disabled={portalLoading}
                      className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      {portalLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ExternalLink className="h-4 w-4" />
                      )}
                      Manage billing (opens in browser)
                    </button>
                    <p className="w-full text-xs text-neutral-500 dark:text-neutral-400">
                      Subscription management is available on the web app.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="w-full">
                      <WhereToChangeHint>
                        {productSettingsCopy.changePlan.label} updates your base plan, Power Ups, storage add-ons, and
                        personal team seats. Billing details use <strong>Manage billing</strong> below.
                      </WhereToChangeHint>
                    </div>
                    <button
                      type="button"
                      onClick={handleChangePlanClick}
                      disabled={powerUpCheckLoading}
                      className="mt-2 inline-flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
                    >
                      {powerUpCheckLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      {productSettingsCopy.changePlan.label}
                    </button>
                    <button
                      type="button"
                      onClick={openPortal}
                      disabled={portalLoading}
                      className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      {portalLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ExternalLink className="h-4 w-4" />
                      )}
                      Manage billing
                    </button>
                    <p className="w-full text-xs text-neutral-500 dark:text-neutral-400">
                      Upgrade, downgrade, or change Power Ups. Manage payment method or cancel in billing.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={syncFromStripe}
                  disabled={syncLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  {syncLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Sync subscription from Stripe
                </button>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  If you just subscribed but still see Starter Free, click to sync.
                </p>
                {isDesktop ? (
                  <button
                    type="button"
                    onClick={() => window.open(`${WEB_APP_URL}/#pricing`, "_blank")}
                    className="inline-flex items-center gap-2 text-sm font-medium text-bizzi-blue hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Upgrade your plan (opens in browser)
                  </button>
                ) : (
                  <Link
                    href="/#pricing"
                    className="inline-flex items-center gap-2 text-sm font-medium text-bizzi-blue hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Upgrade your plan
                  </Link>
                )}
              </div>
            )}
            {portalError && (
              <p className="text-sm text-red-600 dark:text-red-400">{portalError}</p>
            )}
          </div>
        </DashboardRouteFade>
      </div>

      {powerUpWarningModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="powerup-warning-title"
          >
          <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex gap-3">
              <AlertTriangle className="h-6 w-6 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <h3 id="powerup-warning-title" className="font-semibold text-neutral-900 dark:text-white">
                  Before you go
                </h3>
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                  If you downgrade your power-up, some files (in RAW or Gallery Media) may no longer be visible in the app. They will still take up storage space on your account.
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPowerUpWarningModalOpen(false)}
                    className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPowerUpWarningModalOpen(false);
                      navigateToChangePlan();
                    }}
                    className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan"
                  >
                    Got it
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </section>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "privacy") {
      document.getElementById("privacy")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [searchParams]);

  return (
    <DashboardRouteFade ready srOnlyMessage="">
      <div className="mx-auto max-w-2xl space-y-6">
          <SettingsScopeHeader
            title="Settings"
            scope="personal"
            permission={{ kind: "editable" }}
            effectSummary="Profile, storage analytics, privacy, subscription, and personal team management for this account."
          />
          <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
            <SettingsSectionScope label={productSettingsCopy.scopes.localDeviceWorkspace} />
            <h2 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-white">
              {productSettingsCopy.localDashboard.movedTitle}
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {productSettingsCopy.localDashboard.movedBody}
            </p>
          </section>
          <PersonalProfileSettingsSection />
          <PersonalCredentialsSection />
          <StorageSection />
          <PrivacySection />
          <SubscriptionSection />
          <TeamManagementSection settingsScope="personal" />
      </div>
    </DashboardRouteFade>
  );
}

export default function SettingsPage() {
  return (
    <>
      <TopBar title="Settings" />
      <main className="flex-1 overflow-auto p-6">
        <Suspense fallback={null}>
          <SettingsContent />
        </Suspense>
      </main>
    </>
  );
}
