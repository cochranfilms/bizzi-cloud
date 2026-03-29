"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  User,
  Bell,
  Lock,
  Monitor,
  Building2,
  HelpCircle,
  LogOut,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useConfirm } from "@/hooks/useConfirm";
import { PERSONAL_TEAM_SEAT_ACCESS_LABELS, type PersonalTeamSeatAccess } from "@/lib/team-seat-pricing";
import SettingsScopeHeader from "@/components/settings/SettingsScopeHeader";
import { productSettingsCopy } from "@/lib/product-settings-copy";
import PersonalProfileSettingsSection from "@/components/settings/PersonalProfileSettingsSection";
import PersonalAccountEmailSection from "@/components/settings/PersonalAccountEmailSection";
import PersonalPasswordChangeSection from "@/components/settings/PersonalPasswordChangeSection";
import SupportTicketModal from "@/components/dashboard/SupportTicketModal";

const NAV_IDS = [
  "account",
  "notifications",
  "security",
  "apps",
  "workspace",
  "help",
] as const;

type MemberNavId = (typeof NAV_IDS)[number];

function formatMemberStorage(bytes: number | null, used: number): string {
  if (bytes === null) {
    return `Shared team pool · ${(used / 1024 ** 3).toFixed(1)} GB used in team workspace`;
  }
  const capGb = bytes / 1024 ** 3;
  const usedGb = used / 1024 ** 3;
  if (capGb >= 1024) {
    return `${(usedGb / 1024).toFixed(2)} TB of ${(capGb / 1024).toFixed(2)} TB used`;
  }
  return `${usedGb.toFixed(1)} GB of ${capGb.toFixed(0)} GB used`;
}

export default function TeamMemberPersonalSettingsLayout({
  teamOwnerUid,
  teamName,
  teamLogoUrl,
  roleLabel,
}: {
  teamOwnerUid: string;
  teamName: string;
  teamLogoUrl: string | null;
  roleLabel: string;
}) {
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const [active, setActive] = useState<MemberNavId>("account");
  const [helpOpen, setHelpOpen] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [membership, setMembership] = useState<{
    seat_status: string;
    seat_access_level: string;
    storage_quota_bytes: number | null;
    storage_used_bytes: number;
    member_since: string | null;
    team_admin_email: string | null;
  } | null>(null);
  const [membershipError, setMembershipError] = useState<string | null>(null);

  const loadMembership = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/personal-team/my-membership?owner_uid=${encodeURIComponent(teamOwnerUid)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not load workspace access");
      }
      const data = (await res.json()) as {
        seat_status: string;
        seat_access_level: string;
        storage_quota_bytes: number | null;
        storage_used_bytes: number;
        member_since: string | null;
        team_admin_email: string | null;
      };
      setMembership(data);
      setMembershipError(null);
    } catch (e) {
      setMembership(null);
      setMembershipError(e instanceof Error ? e.message : "Could not load workspace access");
    }
  }, [user, teamOwnerUid]);

  useEffect(() => {
    void loadMembership();
  }, [loadMembership]);

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    if (hash && NAV_IDS.includes(hash as MemberNavId)) {
      setActive(hash as MemberNavId);
    }
  }, []);

  const setNav = (id: MemberNavId) => {
    setActive(id);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id}`);
    }
  };

  const accessLevelLabel =
    membership &&
    PERSONAL_TEAM_SEAT_ACCESS_LABELS[membership.seat_access_level as PersonalTeamSeatAccess]
      ? PERSONAL_TEAM_SEAT_ACCESS_LABELS[membership.seat_access_level as PersonalTeamSeatAccess]
      : roleLabel;

  /** Show leave unless we positively know they’re only invited or already removed. */
  const canLeaveTeam =
    membership === null ||
    (membership.seat_status !== "removed" && membership.seat_status !== "invited");

  const handleLeaveTeam = async () => {
    const ok = await confirm({
      message: `Leave “${teamName}”? You will lose access to this team’s shared workspace and files here. Your personal Bizzi account is not deleted.`,
      destructive: true,
      confirmLabel: "Leave team",
    });
    if (!ok || !user) return;
    setLeaveLoading(true);
    setLeaveError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/personal-team/leave", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ team_owner_user_id: teamOwnerUid }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        suggestIdentityDeletion?: boolean;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Could not leave this team");
      }
      if (data.suggestIdentityDeletion) {
        window.location.href = "/dashboard/settings#privacy";
      } else {
        window.location.href = "/dashboard";
      }
    } catch (e) {
      setLeaveError(e instanceof Error ? e.message : "Could not leave this team");
    } finally {
      setLeaveLoading(false);
    }
  };

  const navBtn = (id: MemberNavId, label: string, Icon: typeof User) => (
    <button
      key={id}
      type="button"
      onClick={() => setNav(id)}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
        active === id
          ? "bg-[var(--enterprise-primary)]/15 text-[var(--enterprise-primary)]"
          : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-80" />
      {label}
    </button>
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 lg:flex-row lg:items-start">
      <nav
        aria-label="Settings sections"
        className="shrink-0 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900 lg:w-56"
      >
        <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Settings
        </p>
        <div className="flex flex-col gap-0.5">
          {navBtn("account", "Account", User)}
          {navBtn("notifications", "Notifications", Bell)}
          {navBtn("security", "Security", Lock)}
          {navBtn("apps", "Apps and devices", Monitor)}
          {navBtn("workspace", "Workspace access", Building2)}
          {navBtn("help", "Help", HelpCircle)}
        </div>
      </nav>

      <div className="min-w-0 flex-1 space-y-6">
        <SettingsScopeHeader
          title="Settings"
          scope="personalTeam"
          permission={{ kind: "memberView" }}
          effectSummary="Your personal account and preferences while using this team workspace. Team invites, seats, and billing are managed by the team admin."
        >
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Personal subscription and dashboard settings:{" "}
            <Link href="/dashboard/settings" className="text-[var(--enterprise-primary)] hover:underline">
              Personal settings
            </Link>
            .
          </p>
        </SettingsScopeHeader>

        {active === "account" && (
          <>
            <PersonalProfileSettingsSection />
            <PersonalAccountEmailSection />
          </>
        )}

        {active === "notifications" && (
          <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
              <Bell className="h-5 w-5 text-[var(--enterprise-primary)]" />
              Notifications
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Mentions, shares, comments, transfers, and invites appear in the{" "}
              <strong className="text-neutral-800 dark:text-neutral-200">bell</strong> in the header. Open
              it to review and mark activity as read.
            </p>
            <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
              Per-type email and push preferences are not split out here yet; time-sensitive mail (like
              invites or billing for <em>your</em> own account) still comes from Bizzi when needed. Team
              subscription email goes to the team admin, not seat members.
            </p>
          </section>
        )}

        {active === "security" && <PersonalPasswordChangeSection />}

        {active === "apps" && (
          <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
              <Monitor className="h-5 w-5 text-[var(--enterprise-primary)]" />
              Apps and devices
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {productSettingsCopy.localDashboard.movedTitle}. {productSettingsCopy.localDashboard.movedBody}
            </p>
            <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
              Desktop app settings (when installed) apply to this browser or device only.
            </p>
          </section>
        )}

        {active === "workspace" && (
          <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
              <Building2 className="h-5 w-5 text-[var(--enterprise-primary)]" />
              Workspace access
            </h2>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
                {teamLogoUrl ? (
                  <Image
                    src={teamLogoUrl}
                    alt=""
                    width={80}
                    height={80}
                    className="h-full w-full object-contain"
                    unoptimized
                  />
                ) : (
                  <Building2 className="h-10 w-10 text-neutral-400" />
                )}
              </div>
              <ul className="min-w-0 flex-1 space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
                <li>
                  <span className="text-neutral-500 dark:text-neutral-400">Team</span>{" "}
                  <span className="font-medium text-neutral-900 dark:text-white">{teamName}</span>
                </li>
                <li>
                  <span className="text-neutral-500 dark:text-neutral-400">Your role</span>{" "}
                  <span className="font-medium text-neutral-900 dark:text-white">{roleLabel}</span>
                </li>
                <li>
                  <span className="text-neutral-500 dark:text-neutral-400">Seat access level</span>{" "}
                  <span className="font-medium text-neutral-900 dark:text-white">
                    {accessLevelLabel}
                  </span>
                </li>
                {membership && (
                  <li>
                    <span className="text-neutral-500 dark:text-neutral-400">Your storage on this team</span>{" "}
                    <span className="font-medium text-neutral-900 dark:text-white">
                      {formatMemberStorage(
                        membership.storage_quota_bytes,
                        membership.storage_used_bytes
                      )}
                    </span>
                  </li>
                )}
                {membership?.member_since && (
                  <li>
                    <span className="text-neutral-500 dark:text-neutral-400">Member since</span>{" "}
                    <span className="font-medium text-neutral-900 dark:text-white">
                      {new Date(membership.member_since).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </li>
                )}
                <li className="text-neutral-600 dark:text-neutral-400">
                  Team storage, invites, and seats are{" "}
                  <strong className="text-neutral-800 dark:text-neutral-200">managed by your team admin</strong>
                  .
                </li>
                {membership?.team_admin_email && (
                  <li>
                    <span className="text-neutral-500 dark:text-neutral-400">Team admin contact</span>{" "}
                    <a
                      href={`mailto:${membership.team_admin_email}`}
                      className="font-medium text-[var(--enterprise-primary)] hover:underline"
                    >
                      {membership.team_admin_email}
                    </a>
                  </li>
                )}
                {membershipError && (
                  <li className="text-amber-700 dark:text-amber-400">{membershipError}</li>
                )}
              </ul>
            </div>
            <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
              For seat changes, invites, or workspace questions, contact your team admin.
            </p>

            {canLeaveTeam ? (
              <div className="mt-6 border-t border-neutral-200 pt-6 dark:border-neutral-700">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
                  <LogOut className="h-4 w-4 text-[var(--enterprise-primary)]" />
                  Leave this team workspace
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Remove yourself from this team. You can rejoin if the admin invites you again.
                </p>
                {leaveError && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">{leaveError}</p>
                )}
                <button
                  type="button"
                  onClick={() => void handleLeaveTeam()}
                  disabled={leaveLoading}
                  className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:bg-neutral-900 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  {leaveLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  Leave team
                </button>
              </div>
            ) : null}
          </section>
        )}

        {active === "help" && (
          <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
              <HelpCircle className="h-5 w-5 text-[var(--enterprise-primary)]" />
              Help and support
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Report an issue or ask a question—we’ll route it to the right team.
            </p>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="mt-4 rounded-lg bg-[var(--enterprise-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Contact support
            </button>
            <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
              The floating help button is also available from any team page.
            </p>
          </section>
        )}
      </div>

      <SupportTicketModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
