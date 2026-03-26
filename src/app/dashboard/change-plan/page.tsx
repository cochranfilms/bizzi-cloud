"use client";

import Link from "next/link";
import TopBar from "@/components/dashboard/TopBar";
import BuildPlanConfigurator from "@/components/pricing/BuildPlanConfigurator";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { ArrowLeft } from "lucide-react";
import DashboardRouteFade from "@/components/dashboard/DashboardRouteFade";

export default function ChangePlanPage() {
  const { user } = useAuth();
  const {
    planId: currentPlanId,
    addonIds: currentAddonIds,
    storageAddonId: currentStorageAddonId,
    teamSeatCounts: subscriptionTeamSeats,
    hasPortalAccess,
    loading: subLoading,
    refetch,
  } = useSubscription();

  if (!user) return null;

  if (subLoading) {
    return (
      <>
        <TopBar title="Change Plan" />
        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-4xl">
            <DashboardRouteFade ready={false} srOnlyMessage="Loading plan options">
              {null}
            </DashboardRouteFade>
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
          <BuildPlanConfigurator
            mode="dashboard"
            showAdditionalStorage
            subscriptionLoading={subLoading}
            currentPlanId={currentPlanId}
            currentAddonIds={currentAddonIds}
            currentStorageAddonId={currentStorageAddonId}
            subscriptionTeamSeats={subscriptionTeamSeats}
            refetchSubscription={refetch}
          />
        </div>
      </main>
    </>
  );
}
