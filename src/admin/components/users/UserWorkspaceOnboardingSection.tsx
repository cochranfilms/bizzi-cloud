"use client";

import type { LucideIcon } from "lucide-react";
import {
  formatCollaborationMode,
  formatPerformanceRegion,
  formatTeamType,
  formatUseCase,
  adminWorkspaceOnboardingHasContent,
} from "@/admin/utils/workspaceOnboardingDisplay";
import type { AdminWorkspaceOnboardingSnapshot } from "@/admin/types/adminUsers.types";
import { formatDateTime } from "@/admin/utils/formatDateTime";
import {
  Building2,
  ClipboardCheck,
  Compass,
  FileSignature,
  Layers,
  Users,
} from "lucide-react";

function InfoTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
}) {
  const empty = value === "—" || value.trim() === "";
  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        empty
          ? "border-neutral-200/80 bg-neutral-50/50 dark:border-neutral-700/60 dark:bg-neutral-900/40"
          : "border-cyan-200/60 bg-gradient-to-br from-white to-cyan-50/40 dark:border-cyan-900/35 dark:from-neutral-900 dark:to-cyan-950/20"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            empty
              ? "bg-neutral-200/60 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500"
              : "bg-cyan-500/15 text-cyan-700 dark:bg-cyan-400/20 dark:text-cyan-300"
          }`}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            {label}
          </p>
          <p
            className={`mt-0.5 text-sm font-medium leading-snug ${
              empty ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-900 dark:text-white"
            }`}
          >
            {empty ? "Not provided" : value}
          </p>
          {sub && !empty ? (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{sub}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function UserWorkspaceOnboardingSection({
  snapshot,
}: {
  snapshot: AdminWorkspaceOnboardingSnapshot | null | undefined;
}) {
  if (!snapshot) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/40 px-4 py-8 text-center dark:border-neutral-700 dark:bg-neutral-900/30">
        <ClipboardCheck className="mx-auto h-8 w-8 text-neutral-400" aria-hidden />
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          No workspace setup record for this user yet.
        </p>
      </div>
    );
  }

  const hasContent = adminWorkspaceOnboardingHasContent({
    status: snapshot.status,
    workspaceDisplayName: snapshot.workspaceDisplayName,
    collaborationMode: snapshot.collaborationMode,
    teamType: snapshot.teamType,
    useCase: snapshot.useCase,
    region: snapshot.preferredPerformanceRegion,
  });

  if (!hasContent) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/40 px-4 py-8 text-center dark:border-neutral-700 dark:bg-neutral-900/30">
        <ClipboardCheck className="mx-auto h-8 w-8 text-neutral-400" aria-hidden />
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          User has not completed workspace onboarding.
        </p>
      </div>
    );
  }

  const statusLabel =
    snapshot.status === "completed"
      ? "Completed"
      : snapshot.status === "pending"
        ? "In progress"
        : "—";

  const statusClass =
    snapshot.status === "completed"
      ? "bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/25 dark:text-emerald-200"
      : snapshot.status === "pending"
        ? "bg-amber-500/15 text-amber-900 ring-1 ring-amber-500/25 dark:text-amber-100"
        : "bg-neutral-200/60 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}
          >
            {statusLabel}
          </span>
          {typeof snapshot.version === "number" ? (
            <span className="rounded-full bg-neutral-200/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
              Schema v{snapshot.version}
            </span>
          ) : null}
        </div>
        {snapshot.completedAt ? (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Completed {formatDateTime(snapshot.completedAt)}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <InfoTile
          icon={Building2}
          label="Workspace name"
          value={(snapshot.workspaceDisplayName ?? "").trim() || "—"}
          sub="Profile / team display preference from setup"
        />
        <InfoTile
          icon={Users}
          label="How they work"
          value={formatCollaborationMode(snapshot.collaborationMode)}
        />
        <InfoTile
          icon={Layers}
          label="Team type"
          value={formatTeamType(snapshot.teamType)}
        />
        <InfoTile
          icon={FileSignature}
          label="Primary use case"
          value={formatUseCase(snapshot.useCase)}
        />
        <InfoTile
          icon={Compass}
          label="Preferred performance region"
          value={formatPerformanceRegion(snapshot.preferredPerformanceRegion)}
          sub="User preference; not infrastructure assignment"
        />
      </div>
    </div>
  );
}
