"use client";

import SideDrawer from "../shared/SideDrawer";
import { formatBytes } from "@/admin/utils/formatBytes";
import { useAdminFormatCurrency } from "@/context/AdminDisplayContext";
import { formatDateTime } from "@/admin/utils/formatDateTime";
import { mapPlanToLabel } from "@/admin/utils/mapPlanToLabel";
import StatusBadge from "../shared/StatusBadge";
import type { AdminUser } from "@/admin/types/adminUsers.types";
import UserWorkspaceOnboardingSection from "./UserWorkspaceOnboardingSection";

interface UserDetailDrawerProps {
  user: AdminUser | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function UserDetailDrawer({
  user,
  isOpen,
  onClose,
}: UserDetailDrawerProps) {
  const formatCurrency = useAdminFormatCurrency();
  if (!user) return null;

  return (
    <SideDrawer isOpen={isOpen} onClose={onClose} title={user.displayName || user.email} width="lg">
      <div className="space-y-6">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Profile
          </h4>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-neutral-500">Email</dt>
              <dd className="font-medium">{user.email}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Plan</dt>
              <dd>{mapPlanToLabel(user.plan)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Status</dt>
              <dd>
                <StatusBadge status={user.status} />
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Signup</dt>
              <dd>{formatDateTime(user.signupDate)}</dd>
            </div>
            {user.lastActive && (
              <div>
                <dt className="text-neutral-500">Last active</dt>
                <dd>{formatDateTime(user.lastActive)}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-2xl border border-cyan-200/50 bg-gradient-to-br from-cyan-50/50 via-white to-white p-5 dark:border-cyan-900/30 dark:from-cyan-950/25 dark:via-neutral-900 dark:to-neutral-900/90">
          <h4 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-800 dark:text-cyan-300">
            <span className="inline-block h-2 w-2 rounded-full bg-cyan-500 shadow-sm shadow-cyan-500/40" />
            Workspace setup
          </h4>
          <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
            Answers from the in-app onboarding wizard (and optional Settings updates).
          </p>
          <UserWorkspaceOnboardingSection snapshot={user.workspaceOnboarding ?? null} />
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Storage
          </h4>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-neutral-500">Used</dt>
              <dd className="font-medium">{formatBytes(user.storageUsedBytes)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Total files</dt>
              <dd>{user.totalFiles.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Uploads this month</dt>
              <dd>{user.uploadsThisMonth.toLocaleString()}</dd>
            </div>
          </dl>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Billing
          </h4>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-neutral-500">Revenue generated</dt>
              <dd className="font-medium">
                {user.revenueGenerated > 0
                  ? formatCurrency(user.revenueGenerated)
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>

        {user.supportFlags.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-600">
              Support flags
            </h4>
            <ul className="list-disc space-y-1 pl-4 text-sm text-amber-700 dark:text-amber-400">
              {user.supportFlags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="border-t border-neutral-200 pt-4 dark:border-neutral-700">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Admin actions
          </h4>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              View billing
            </button>
            <button
              type="button"
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Reset storage cache
            </button>
            {user.status === "active" ? (
              <button
                type="button"
                className="rounded-lg border border-amber-200 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/20"
              >
                Suspend account
              </button>
            ) : user.status === "suspended" ? (
              <button
                type="button"
                className="rounded-lg border border-emerald-200 px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
              >
                Reactivate
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </SideDrawer>
  );
}
