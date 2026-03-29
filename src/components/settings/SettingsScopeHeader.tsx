"use client";

import type { SettingsPermissionBadge } from "@/lib/product-settings-copy";

export type SettingsScopeKind =
  | "personal"
  | "personalTeam"
  | "enterprise"
  | "gallery"
  | "localDashboard";

const SCOPE_LABEL: Record<SettingsScopeKind, string> = {
  personal: "Personal account",
  personalTeam: "Personal team",
  enterprise: "Enterprise workspace",
  gallery: "Gallery",
  localDashboard: "This device",
};

const PERMISSION_LABEL: Record<SettingsPermissionBadge, string> = {
  editable: "You can edit",
  ownerOnly: "Owner only",
  adminOnly: "Admin only",
  readOnly: "View only",
  memberView: "View only",
};

export default function SettingsScopeHeader({
  title,
  scope,
  permission,
  effectSummary,
  children,
}: {
  title: string;
  scope: SettingsScopeKind;
  permission: { kind: SettingsPermissionBadge; reason?: string };
  effectSummary: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-8 space-y-3 border-b border-neutral-200 pb-6 dark:border-neutral-700">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {SCOPE_LABEL[scope]}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            {title}
          </h1>
        </div>
        <span
          className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
          title={permission.reason}
        >
          {PERMISSION_LABEL[permission.kind]}
        </span>
      </div>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{effectSummary}</p>
      {permission.reason && permission.kind !== "editable" ? (
        <p className="text-sm text-amber-800 dark:text-amber-200/90">{permission.reason}</p>
      ) : null}
      {children}
    </header>
  );
}
