"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Users, Loader2, UserMinus, Mail, AlertTriangle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import { planAllowsPersonalTeamSeats } from "@/lib/pricing-data";
import {
  PERSONAL_TEAM_SEAT_ACCESS_LABELS,
  sumExtraTeamSeats,
  type PersonalTeamSeatAccess,
} from "@/lib/team-seat-pricing";
import { PRODUCT_SEAT_STORAGE_BYTES } from "@/lib/enterprise-constants";
import SettingsSectionScope from "@/components/settings/SettingsSectionScope";
import { productSettingsCopy } from "@/lib/product-settings-copy";

const STORAGE_TIER_LABELS = [
  "50 GB",
  "100 GB",
  "250 GB",
  "500 GB",
  "1 TB",
  "2 TB",
  "5 TB",
  "10 TB",
] as const;

const BASE_MEMBER_STORAGE_OPTIONS = [
  ...PRODUCT_SEAT_STORAGE_BYTES.map((value, i) => ({
    label: STORAGE_TIER_LABELS[i] ?? `${value}`,
    value: value as number,
  })),
  { label: "Unlimited (team pool)", value: null as null },
] as const;

type MemberApi = {
  id: string;
  member_user_id: string;
  email: string;
  seat_access_level: string;
  status: string;
  quota_mode?: string;
  storage_quota_bytes: number | null;
  storage_used_bytes: number;
};

type PendingInviteApi = {
  id: string;
  invited_email: string;
  seat_access_level: string;
  quota_mode?: string;
  storage_quota_bytes: number | null;
};

type OverviewApi = {
  team_seat_counts: { none: number; gallery: number; editor: number; fullframe: number };
  used: { none: number; gallery: number; editor: number; fullframe: number };
  available: { none: number; gallery: number; editor: number; fullframe: number };
  plan_id: string;
  plan_label: string;
  team_quota_bytes?: number;
  team_used_bytes?: number;
  total_plan_billable_bytes?: number;
  fixed_cap_allocated_bytes?: number;
  fixed_cap_reserved_pending_invites_bytes?: number;
  numeric_allocated_seat_bytes?: number;
  remaining_numeric_allocatable_bytes?: number;
  remaining_fixed_cap_allocatable_bytes?: number;
  remaining_team_workspace_headroom_bytes?: number;
  remaining_plan_headroom_bytes?: number;
};

function maxBytesForNewFixedCap(overview: OverviewApi | null): number {
  if (!overview) return 0;
  const v =
    overview.remaining_fixed_cap_allocatable_bytes ??
    overview.remaining_numeric_allocatable_bytes ??
    0;
  return Math.max(0, v);
}

function maxBytesForMemberSeatEdit(m: MemberApi, overview: OverviewApi | null): number {
  const reclaim =
    typeof m.storage_quota_bytes === "number" ? m.storage_quota_bytes : 0;
  return maxBytesForNewFixedCap(overview) + reclaim;
}

function statusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Active";
    case "invited":
      return "Invited";
    case "removed":
      return "Removed";
    case "cold_storage":
      return "Left (cold storage)";
    default:
      return status;
  }
}

function accessLevelLabel(level: string | undefined): string {
  if (level && level in PERSONAL_TEAM_SEAT_ACCESS_LABELS) {
    return PERSONAL_TEAM_SEAT_ACCESS_LABELS[level as PersonalTeamSeatAccess];
  }
  return level ?? "—";
}

function formatStorage(bytes: number | null): string {
  if (bytes === null) return "Unlimited (team pool)";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  return `${gb.toFixed(0)} GB`;
}

function selectStorageOptions(currentBytes: number | null) {
  const tierSet = new Set<number>([...PRODUCT_SEAT_STORAGE_BYTES]);
  const hasCustom = typeof currentBytes === "number" && !tierSet.has(currentBytes);
  const extra = hasCustom
    ? [{ label: `Current (${formatStorage(currentBytes)})`, value: currentBytes as number }]
    : [];
  return [...extra, ...BASE_MEMBER_STORAGE_OPTIONS] as { label: string; value: number | null }[];
}

/** Shown when the user has seat memberships on others’ personal teams (leave per team). */
export function MemberTeamCard() {
  const { user } = useAuth();
  const { personalTeamMemberships, refetch } = useSubscription();
  const [leavingOwnerId, setLeavingOwnerId] = useState<string | null>(null);
  const [confirmOwnerId, setConfirmOwnerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLeave = async (teamOwnerUserId: string) => {
    if (!user || !isFirebaseConfigured()) return;
    setLeavingOwnerId(teamOwnerUserId);
    setError(null);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      const res = await fetch("/api/personal-team/leave", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ team_owner_user_id: teamOwnerUserId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data.error as string) ?? "Failed to leave team");
      }
      await refetch();
      setConfirmOwnerId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to leave");
    } finally {
      setLeavingOwnerId(null);
    }
  };

  if (!personalTeamMemberships.length) return null;

  return (
    <section
      id="team-memberships"
      className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900"
    >
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
        <Users className="h-5 w-5 text-bizzi-blue" />
        {personalTeamMemberships.length > 1 ? "Team memberships" : "Team membership"}
      </h2>
      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        {personalTeamMemberships.length > 1 ? (
          <>
            You&apos;re a member of <strong className="text-neutral-900 dark:text-white">multiple</strong>{" "}
            personal Bizzi teams. Storage is shared per team; you can only delete files you uploaded. Your
            personal subscription stays billed separately.
          </>
        ) : (
          <>
            You&apos;re on a <strong className="text-neutral-900 dark:text-white">personal Bizzi team</strong>.
            Team storage is shared; you can only delete files you uploaded. Your personal subscription stays
            billed separately.
          </>
        )}
      </p>
      <ul className="space-y-4">
        {personalTeamMemberships.map((m) => {
          const levelLabel = accessLevelLabel(m.seat_access_level);
          const statusNote =
            m.status === "cold_storage" ? " · Recovery storage" : "";
          return (
            <li
              key={m.owner_user_id}
              className="flex flex-col gap-2 rounded-lg border border-neutral-100 bg-neutral-50/80 p-4 dark:border-neutral-700 dark:bg-neutral-800/40 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900 dark:text-white">
                  Team workspace
                  <span className="ml-2 font-mono text-xs font-normal text-neutral-500 dark:text-neutral-400">
                    {m.owner_user_id.slice(0, 6)}…{m.owner_user_id.slice(-4)}
                  </span>
                </p>
                <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                  Seat access: <strong className="text-neutral-800 dark:text-neutral-200">{levelLabel}</strong>
                  {statusNote}
                </p>
                <Link
                  href={`/team/${m.owner_user_id}`}
                  className="mt-2 inline-block text-xs font-medium text-bizzi-blue hover:underline dark:text-bizzi-cyan"
                >
                  Open team workspace
                </Link>
              </div>
              <button
                type="button"
                onClick={() => setConfirmOwnerId(m.owner_user_id)}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              >
                <UserMinus className="h-4 w-4" />
                Leave
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {confirmOwnerId &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
              <div className="flex gap-3">
                <AlertTriangle className="h-6 w-6 shrink-0 text-amber-500" />
                <div>
                  <h3 className="font-semibold text-neutral-900 dark:text-white">Leave this team?</h3>
                  <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                    Files you uploaded in the team space will be moved to cold storage. You will lose team
                    access.
                  </p>
                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmOwnerId(null)}
                      className="rounded-lg border border-neutral-200 px-4 py-2 text-sm dark:border-neutral-600"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={leavingOwnerId === confirmOwnerId}
                      onClick={() => void handleLeave(confirmOwnerId)}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                    >
                      {leavingOwnerId === confirmOwnerId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Leave team"
                      )}
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

export function TeamManagementSection() {
  const { user } = useAuth();
  const {
    planId,
    ownsPersonalTeam,
    personalTeamMemberships,
    teamSeatCounts,
    loading: subLoading,
    refetch: refetchSubscription,
  } = useSubscription();

  const [members, setMembers] = useState<MemberApi[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInviteApi[]>([]);
  const [overview, setOverview] = useState<OverviewApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLevel, setInviteLevel] = useState<PersonalTeamSeatAccess>("none");
  const [inviteStorageBytes, setInviteStorageBytes] = useState<number | null>(null);
  const [inviting, setInviting] = useState(false);
  const [updatingStorageSeatId, setUpdatingStorageSeatId] = useState<string | null>(null);
  const [inviteMsg, setInviteMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MemberApi | null>(null);
  const [removing, setRemoving] = useState(false);

  const allowsSeats = planAllowsPersonalTeamSeats(planId);

  const loadTeam = useCallback(async () => {
    if (!user || !isFirebaseConfigured() || !ownsPersonalTeam || !allowsSeats) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      const res = await fetch("/api/personal-team/members", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMembers([]);
        setPendingInvites([]);
        setOverview(null);
        return;
      }
      setMembers((data.members as MemberApi[]) ?? []);
      setPendingInvites((data.pending_invites as PendingInviteApi[]) ?? []);
      setOverview((data.overview as OverviewApi) ?? null);
    } catch {
      setMembers([]);
      setPendingInvites([]);
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [user, ownsPersonalTeam, allowsSeats]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  const purchasedExtra = sumExtraTeamSeats(teamSeatCounts);
  const hasCapacity = purchasedExtra > 0;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      const res = await fetch("/api/personal-team/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          seat_access_level: inviteLevel,
          storage_quota_bytes: inviteStorageBytes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInviteMsg({ type: "err", text: (data.error as string) ?? "Invite failed" });
        return;
      }
      setInviteMsg({
        type: "ok",
        text: "Invite sent. They must accept the invite (link in email) before they’re added to the team.",
      });
      setInviteEmail("");
      await refetchSubscription();
      await loadTeam();
    } catch {
      setInviteMsg({ type: "err", text: "Invite failed" });
    } finally {
      setInviting(false);
    }
  };

  const handleMemberStorageChange = async (seatId: string, newQuota: number | null) => {
    if (!user) return;
    setUpdatingStorageSeatId(seatId);
    setInviteMsg(null);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      const res = await fetch(`/api/personal-team/seats/${encodeURIComponent(seatId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ storage_quota_bytes: newQuota }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInviteMsg({ type: "err", text: (data.error as string) ?? "Could not update storage" });
        return;
      }
      await loadTeam();
    } catch {
      setInviteMsg({ type: "err", text: "Could not update storage" });
    } finally {
      setUpdatingStorageSeatId(null);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget || !user) return;
    setRemoving(true);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      const res = await fetch("/api/personal-team/remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ member_user_id: removeTarget.member_user_id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInviteMsg({ type: "err", text: (data.error as string) ?? "Remove failed" });
        return;
      }
      setRemoveTarget(null);
      await refetchSubscription();
      await loadTeam();
    } catch {
      setInviteMsg({ type: "err", text: "Remove failed" });
    } finally {
      setRemoving(false);
    }
  };

  if (subLoading) return null;

  const showOwnerPanel = ownsPersonalTeam && allowsSeats;
  const showMemberPanel = personalTeamMemberships.length > 0;

  if (!showOwnerPanel && !showMemberPanel) return null;

  if (!showOwnerPanel) {
    return <MemberTeamCard />;
  }

  const activeMembers = members.filter((m) => m.status === "active" || m.status === "invited");
  const inviteFixedCapBudget = maxBytesForNewFixedCap(overview);
  const usedTotal =
    (overview?.used.none ?? 0) +
    (overview?.used.gallery ?? 0) +
    (overview?.used.editor ?? 0) +
    (overview?.used.fullframe ?? 0);

  return (
    <>
    <section
      id="team-management"
      className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900"
    >
      <SettingsSectionScope label={productSettingsCopy.scopes.thisTeamWorkspaceOnly} />
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
        <Users className="h-5 w-5 text-bizzi-blue" />
        Team Management
      </h2>
      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        Manage your <strong className="text-neutral-900 dark:text-white">personal team seats</strong>, invite
        members, assign seat access, and share storage. This is <strong>not</strong> an Organization.
      </p>
      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        <strong className="text-neutral-900 dark:text-white">Team pool</strong> means everyone shares{" "}
        <strong className="text-neutral-900 dark:text-white">your purchased storage</strong>
        — not extra space. Fixed caps reserve slices of that same pool; “Unlimited (team pool)” still
        uses your plan and cannot exceed your total. Combined usage (you + all members, team folder +
        your personal files on this account) can never go above your plan.
      </p>

      <div className="mb-6 rounded-lg border border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Team overview</h3>
        <ul className="mt-2 space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
          <li>
            <strong className="text-neutral-800 dark:text-neutral-200">Owner:</strong>{" "}
            {user?.email ?? "—"}
          </li>
          <li>
            <strong className="text-neutral-800 dark:text-neutral-200">Plan:</strong>{" "}
            {overview?.plan_label ?? "—"}
          </li>
          <li>
            <strong className="text-neutral-800 dark:text-neutral-200">Purchased extra seats:</strong>{" "}
            {purchasedExtra} across tiers (none / gallery / editor / full frame)
          </li>
          <li>
            <strong className="text-neutral-800 dark:text-neutral-200">Assigned + pending:</strong>{" "}
            {loading ? "…" : usedTotal}{" "}
            {!loading && (
              <span className="text-neutral-500">
                ({Math.max(0, purchasedExtra - usedTotal)} available)
              </span>
            )}
          </li>
          <li className="text-xs text-neutral-500">
            Only you can buy more plan storage. Teammates keep their own personal Bizzi billing for
            accounts that aren’t on this team.
          </li>
          {typeof overview?.team_quota_bytes === "number" && (
            <li className="space-y-1 text-xs text-neutral-500">
              <div>
                <strong className="text-neutral-700 dark:text-neutral-300">Purchased plan (ceiling):</strong>{" "}
                {formatStorage(overview.team_quota_bytes)}
              </div>
              <div>
                <strong className="text-neutral-700 dark:text-neutral-300">Team folder used:</strong>{" "}
                {formatStorage(overview.team_used_bytes ?? 0)} (files in this team workspace only)
              </div>
              <div>
                <strong className="text-neutral-700 dark:text-neutral-300">Account billable total (owner):</strong>{" "}
                {formatStorage(overview.total_plan_billable_bytes ?? 0)} (personal solo + hosted team — hard
                ceiling for uploads)
              </div>
              <div>
                <strong className="text-neutral-700 dark:text-neutral-300">Fixed caps on seats:</strong>{" "}
                {formatStorage(overview.fixed_cap_allocated_bytes ?? 0)}
              </div>
              <div>
                <strong className="text-neutral-700 dark:text-neutral-300">Reserved on pending invites:</strong>{" "}
                {formatStorage(overview.fixed_cap_reserved_pending_invites_bytes ?? 0)}
              </div>
              <div>
                <strong className="text-neutral-700 dark:text-neutral-300">
                  Fixed-cap assignable headroom:
                </strong>{" "}
                {formatStorage(overview.remaining_fixed_cap_allocatable_bytes ?? 0)}{" "}
                <span className="font-normal text-neutral-500">
                  (budget for fixed tiers on seats + pending invites; unlimited seats do not reserve this)
                </span>
              </div>
              <div>
                <strong className="text-neutral-700 dark:text-neutral-300">Team-folder usable headroom:</strong>{" "}
                {formatStorage(overview.remaining_team_workspace_headroom_bytes ?? 0)}{" "}
                <span className="font-normal text-neutral-500">
                  (purchased plan minus team-workspace uploads only; excludes your personal solo files)
                </span>
              </div>
              <div>
                <strong className="text-neutral-700 dark:text-neutral-300">Owner plan headroom (uploads):</strong>{" "}
                {formatStorage(overview.remaining_plan_headroom_bytes ?? 0)}{" "}
                <span className="font-normal text-neutral-500">
                  (purchased plan minus full billable total — same gate as uploads)
                </span>
              </div>
            </li>
          )}
        </ul>
      </div>

      {!hasCapacity ? (
        <div className="rounded-lg border border-dashed border-bizzi-blue/40 bg-cyan-50/50 p-4 dark:bg-cyan-950/20">
          <p className="text-sm font-medium text-neutral-900 dark:text-white">Your team is ready</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Add team seats on your plan, then invite members to collaborate.
          </p>
          <Link
            href="/dashboard/change-plan"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan"
          >
            Add team seats
          </Link>
        </div>
      ) : activeMembers.length === 0 && pendingInvites.length === 0 ? (
        <div className="mb-6 rounded-lg border border-dashed border-neutral-200 p-4 dark:border-neutral-600">
          <p className="text-sm font-medium text-neutral-900 dark:text-white">
            Your team is ready — invite members to start collaborating
          </p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            No one has been invited yet. Use the form below.
          </p>
        </div>
      ) : null}

      <div className="mb-6">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
          <Mail className="h-4 w-4 text-bizzi-blue" />
          Invite member
        </h3>
        <form
          onSubmit={(e) => void handleInvite(e)}
          className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end"
        >
          <div className="min-w-0 flex-1">
            <label htmlFor="team-invite-email" className="mb-1 block text-xs text-neutral-500">
              Email
            </label>
            <input
              id="team-invite-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              placeholder="teammate@example.com"
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
            />
          </div>
          <div className="sm:w-52">
            <label htmlFor="team-invite-level" className="mb-1 block text-xs text-neutral-500">
              Seat access
            </label>
            <select
              id="team-invite-level"
              value={inviteLevel}
              onChange={(e) => setInviteLevel(e.target.value as PersonalTeamSeatAccess)}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
            >
              <option value="none">{PERSONAL_TEAM_SEAT_ACCESS_LABELS.none}</option>
              <option value="gallery">{PERSONAL_TEAM_SEAT_ACCESS_LABELS.gallery}</option>
              <option value="editor">{PERSONAL_TEAM_SEAT_ACCESS_LABELS.editor}</option>
              <option value="fullframe">{PERSONAL_TEAM_SEAT_ACCESS_LABELS.fullframe}</option>
            </select>
          </div>
          <div className="sm:w-56">
            <label htmlFor="team-invite-storage" className="mb-1 block text-xs text-neutral-500">
              Member storage cap
            </label>
            <select
              id="team-invite-storage"
              value={inviteStorageBytes === null ? "" : String(inviteStorageBytes)}
              onChange={(e) => {
                const v = e.target.value;
                setInviteStorageBytes(v === "" ? null : Number(v));
              }}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
            >
              {BASE_MEMBER_STORAGE_OPTIONS.map((opt) => {
                const overBudget =
                  opt.value !== null &&
                  typeof opt.value === "number" &&
                  opt.value > inviteFixedCapBudget;
                return (
                  <option
                    key={opt.label}
                    value={opt.value === null ? "" : String(opt.value)}
                    disabled={overBudget}
                  >
                    {opt.label}
                    {overBudget ? " (exceeds fixed-cap assignable budget)" : ""}
                  </option>
                );
              })}
            </select>
          </div>
          <button
            type="submit"
            disabled={inviting || !hasCapacity}
            className="shrink-0 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan disabled:opacity-50"
          >
            {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invite"}
          </button>
        </form>
        {!hasCapacity && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            Purchase team seats before inviting.
          </p>
        )}
        {overview?.available != null && hasCapacity && (
          <p className="mt-2 text-xs text-neutral-500">
            Remaining at this tier:{" "}
            <strong>
              {inviteLevel === "none" && overview.available.none}
              {inviteLevel === "gallery" && overview.available.gallery}
              {inviteLevel === "editor" && overview.available.editor}
              {inviteLevel === "fullframe" && overview.available.fullframe}
            </strong>
            {" · "}
            Max fixed tier for invites: <strong>{formatStorage(inviteFixedCapBudget)}</strong>{" "}
            <span className="text-neutral-500">(assignable fixed-cap budget)</span>
          </p>
        )}
        {inviteMsg && (
          <p
            className={`mt-2 text-sm ${inviteMsg.type === "ok" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
          >
            {inviteMsg.text}
          </p>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-white">Members</h3>
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-bizzi-blue" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/80">
                <tr>
                  <th className="p-3 font-medium">Email</th>
                  <th className="whitespace-nowrap p-3 font-medium">Pool storage</th>
                  <th className="p-3 font-medium">Access</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium w-24" />
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map((p) => (
                  <tr key={p.id} className="border-b border-neutral-100 dark:border-neutral-800">
                    <td className="p-3">{p.invited_email}</td>
                    <td className="p-3 text-neutral-600 dark:text-neutral-400">
                      <span className="text-neutral-500">—</span>
                      <span className="mt-1 block text-xs">
                        Cap: {formatStorage(p.storage_quota_bytes ?? null)}
                      </span>
                    </td>
                    <td className="p-3">
                      {PERSONAL_TEAM_SEAT_ACCESS_LABELS[p.seat_access_level as PersonalTeamSeatAccess] ??
                        p.seat_access_level}
                    </td>
                    <td className="p-3">Pending</td>
                    <td className="p-3" />
                  </tr>
                ))}
                {members.map((m) => {
                  const cap = m.storage_quota_bytes ?? null;
                  const usageLabel = `${formatStorage(m.storage_used_bytes)} of ${formatStorage(cap)} used`;
                  const memberCapBudget = maxBytesForMemberSeatEdit(m, overview);
                  return (
                    <tr key={m.id} className="border-b border-neutral-100 dark:border-neutral-800">
                      <td className="p-3">{m.email || "—"}</td>
                      <td className="p-3">
                        {m.status === "active" ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-neutral-600 dark:text-neutral-400">
                              {usageLabel}
                            </span>
                            <select
                              aria-label={`Storage cap for ${m.email}`}
                              disabled={updatingStorageSeatId === m.id}
                              value={cap === null ? "" : String(cap)}
                              onChange={(e) => {
                                const v = e.target.value;
                                void handleMemberStorageChange(m.id, v === "" ? null : Number(v));
                              }}
                              className="max-w-[11rem] rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                            >
                              {selectStorageOptions(cap).map((opt) => {
                                const overBudget =
                                  opt.value !== null &&
                                  typeof opt.value === "number" &&
                                  opt.value > memberCapBudget;
                                return (
                                  <option
                                    key={`${opt.label}-${opt.value ?? "u"}`}
                                    value={opt.value === null ? "" : String(opt.value)}
                                    disabled={overBudget}
                                  >
                                    {opt.label}
                                    {overBudget ? " (exceeds fixed-cap assignable budget)" : ""}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-500">{usageLabel}</span>
                        )}
                      </td>
                      <td className="p-3">
                        {PERSONAL_TEAM_SEAT_ACCESS_LABELS[m.seat_access_level as PersonalTeamSeatAccess] ??
                          m.seat_access_level}
                      </td>
                      <td className="p-3">{statusLabel(m.status)}</td>
                      <td className="p-3">
                        {(m.status === "active" || m.status === "invited") && (
                          <button
                            type="button"
                            onClick={() => setRemoveTarget(m)}
                            className="text-red-600 hover:underline dark:text-red-400"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {pendingInvites.length === 0 && members.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-neutral-500">
                      No members yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/dashboard/change-plan"
          className="inline-flex items-center rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
        >
          Add more seats
        </Link>
      </div>

      {removeTarget &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
          >
          <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
            <h3 className="font-semibold text-neutral-900 dark:text-white">Remove member?</h3>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Their team uploads will move to cold storage. They will lose access to your team.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRemoveTarget(null)}
                className="rounded-lg border border-neutral-200 px-4 py-2 text-sm dark:border-neutral-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={removing}
                onClick={() => void handleRemove()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}
              </button>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </section>
    {showMemberPanel ? <MemberTeamCard /> : null}
    </>
  );
}
