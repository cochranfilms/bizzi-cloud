"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Users, Loader2, Mail } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import { planAllowsPersonalTeamSeats } from "@/lib/pricing-data";
import {
  PERSONAL_TEAM_SEAT_ACCESS_LABELS,
  isPersonalTeamSeatAccess,
  sumExtraTeamSeats,
  type PersonalTeamSeatAccess,
} from "@/lib/team-seat-pricing";
import { PRODUCT_SEAT_STORAGE_BYTES } from "@/lib/enterprise-constants";
import SettingsSectionScope from "@/components/settings/SettingsSectionScope";
import { productSettingsCopy } from "@/lib/product-settings-copy";
import PersonalTeamIdentityForm from "@/components/dashboard/PersonalTeamIdentityForm";

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
  invited_email?: string | null;
  quota_mode?: string;
  storage_quota_bytes: number | null;
  storage_used_bytes: number;
  removed_at?: string | null;
  updated_at?: string | null;
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
      return "Removed";
    default:
      return status;
  }
}

/** Status column in the Removed members table only (defensive: legacy cold_storage rows). */
function removedSectionStatusLabel(status: string): string {
  if (status === "cold_storage" || status === "removed") return "Removed";
  return statusLabel(status);
}

function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

function parseUpdatedAtMs(m: MemberApi): number {
  const raw = m.updated_at;
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t;
}

function sortActiveSeatMembers(list: MemberApi[]): MemberApi[] {
  const rank = (s: string) => (s === "active" ? 0 : 1);
  return [...list].sort((a, b) => {
    const r = rank(a.status) - rank(b.status);
    if (r !== 0) return r;
    return parseUpdatedAtMs(b) - parseUpdatedAtMs(a);
  });
}

function sortRemovedSeatMembers(list: MemberApi[]): MemberApi[] {
  const rank = (s: string) => (s === "removed" ? 0 : s === "cold_storage" ? 1 : 2);
  return [...list].sort((a, b) => {
    const r = rank(a.status) - rank(b.status);
    if (r !== 0) return r;
    return parseUpdatedAtMs(b) - parseUpdatedAtMs(a);
  });
}

/** Re-invite prefill: drop fixed cap when it no longer fits assignable budget; use unlimited (null). */
function inviteStorageForReuse(m: MemberApi, overview: OverviewApi | null): number | null {
  const cap = m.storage_quota_bytes ?? null;
  if (cap === null) return null;
  const budget = maxBytesForNewFixedCap(overview);
  if (cap > budget) return null;
  return cap;
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

export type TeamManagementSettingsScope = "personal" | "team";

export function TeamManagementSection({
  settingsScope = "team",
}: {
  settingsScope?: TeamManagementSettingsScope;
} = {}) {
  const { user } = useAuth();
  const {
    planId,
    ownsPersonalTeam,
    teamSeatCounts,
    loading: subLoading,
    refetch: refetchSubscription,
  } = useSubscription();

  const allowsSeats = planAllowsPersonalTeamSeats(planId);
  const showOwnerPanel = ownsPersonalTeam && allowsSeats;
  const [teamIdentityLoading, setTeamIdentityLoading] = useState(true);
  const [teamHasName, setTeamHasName] = useState(false);
  const [teamIdentityName, setTeamIdentityName] = useState("");
  const [teamIdentityLogoUrl, setTeamIdentityLogoUrl] = useState<string | null>(null);
  const [identityRefreshTick, setIdentityRefreshTick] = useState(0);

  const scopeLabel =
    settingsScope === "personal"
      ? productSettingsCopy.scopes.personalAccountOnly
      : productSettingsCopy.scopes.thisTeamWorkspaceOnly;

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
  const inviteEmailRef = useRef<HTMLInputElement>(null);
  const [closeModal, setCloseModal] = useState<"none" | "preview" | "success">("none");
  const [closePreviewLoading, setClosePreviewLoading] = useState(false);
  const [closePreviewData, setClosePreviewData] = useState<Record<string, unknown> | null>(null);
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closeResult, setCloseResult] = useState<Record<string, unknown> | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !showOwnerPanel) {
      setTeamIdentityLoading(false);
      return;
    }
    let cancelled = false;
    setTeamIdentityLoading(true);
    (async () => {
      try {
        const token = await getFirebaseAuth().currentUser?.getIdToken();
        if (!token) {
          if (!cancelled) {
            setTeamHasName(true);
            setTeamIdentityLoading(false);
          }
          return;
        }
        const res = await fetch(
          `/api/personal-team/settings?owner_uid=${encodeURIComponent(user.uid)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = (await res.json().catch(() => ({}))) as {
          team_name?: string | null;
          logo_url?: string | null;
        };
        if (cancelled) return;
        const trimmedName = (data.team_name ?? "").trim();
        setTeamHasName(Boolean(trimmedName));
        setTeamIdentityName(trimmedName);
        const logo = (data.logo_url ?? "").trim();
        setTeamIdentityLogoUrl(logo.length > 0 ? logo : null);
      } catch {
        if (!cancelled) setTeamHasName(true);
      } finally {
        if (!cancelled) setTeamIdentityLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, showOwnerPanel, identityRefreshTick]);

  const loadTeam = useCallback(async () => {
    if (!user || !isFirebaseConfigured() || !ownsPersonalTeam || !allowsSeats) {
      setLoading(false);
      return;
    }
    if (!teamHasName) {
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
  }, [user, ownsPersonalTeam, allowsSeats, teamHasName]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  const purchasedExtra = sumExtraTeamSeats(teamSeatCounts);
  const hasCapacity = purchasedExtra > 0;

  const handleInviteBack = (m: MemberApi) => {
    const rawEmail = (m.email || m.invited_email || "").trim();
    setInviteEmail(rawEmail);
    setInviteLevel(
      isPersonalTeamSeatAccess(m.seat_access_level) ? m.seat_access_level : "none"
    );
    setInviteStorageBytes(inviteStorageForReuse(m, overview));
    setInviteMsg(null);
    requestAnimationFrame(() => {
      inviteEmailRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      inviteEmailRef.current?.focus({ preventScroll: true });
    });
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setInviting(true);
    setInviteMsg(null);
    const normalizedInvite = normalizeInviteEmail(inviteEmail);
    if (normalizedInvite) {
      if (
        pendingInvites.some((p) => normalizeInviteEmail(p.invited_email) === normalizedInvite)
      ) {
        setInviteMsg({
          type: "err",
          text: "An invite is already pending for this email.",
        });
        setInviting(false);
        return;
      }
      const existingSeat = members.find(
        (m) =>
          (m.status === "active" || m.status === "invited") &&
          normalizeInviteEmail(m.email) === normalizedInvite
      );
      if (existingSeat) {
        setInviteMsg({
          type: "err",
          text:
            existingSeat.status === "active"
              ? "This email already has an active seat on the team."
              : "An invite is already out for this person.",
        });
        setInviting(false);
        return;
      }
    }
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

  const openCloseTeamWorkspace = () => {
    setCloseError(null);
    setCloseResult(null);
    setClosePreviewData(null);
    setCloseModal("preview");
    setClosePreviewLoading(true);
    void (async () => {
      try {
        const token = await getFirebaseAuth().currentUser?.getIdToken();
        const res = await fetch("/api/personal-team/close/preview", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setCloseError((data as { error?: string }).error ?? "Could not load close summary.");
          setCloseModal("none");
          return;
        }
        setClosePreviewData(data as Record<string, unknown>);
      } catch {
        setCloseError("Could not load close summary.");
        setCloseModal("none");
      } finally {
        setClosePreviewLoading(false);
      }
    })();
  };

  const confirmCloseTeamWorkspace = () => {
    void (async () => {
      if (!user) return;
      setCloseSubmitting(true);
      setCloseError(null);
      try {
        const token = await getFirebaseAuth().currentUser?.getIdToken();
        const res = await fetch("/api/personal-team/close", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setCloseError((data as { error?: string }).error ?? "Close failed.");
          return;
        }
        setCloseResult(data as Record<string, unknown>);
        setCloseModal("success");
        await refetchSubscription();
        await loadTeam();
        setIdentityRefreshTick((t) => t + 1);
      } catch {
        setCloseError("Close failed.");
      } finally {
        setCloseSubmitting(false);
      }
    })();
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

  if (!showOwnerPanel) {
    return null;
  }

  if (teamIdentityLoading) {
    return (
      <section
        id="team-management"
        className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900"
      >
        <SettingsSectionScope label={scopeLabel} />
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-bizzi-blue" aria-hidden />
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Loading team workspace…</p>
        </div>
      </section>
    );
  }

  if (!teamHasName) {
    if (!user) return null;
    return (
      <section
        id="team-management"
        className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900"
      >
        <SettingsSectionScope label={scopeLabel} />
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
          <Users className="h-5 w-5 text-bizzi-blue" />
          Personal team workspace
        </h2>
        <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">
          Set up your team identity first. After that, you&apos;ll get the full Team Management view —
          including seat purchases and invites.
        </p>
        <PersonalTeamIdentityForm
          ownerUid={user.uid}
          layout="settings"
          className="p-5 sm:p-6"
          onComplete={() => {
            setTeamHasName(true);
            setIdentityRefreshTick((t) => t + 1);
            void refetchSubscription();
          }}
        />
      </section>
    );
  }

  const activeSeatMembers = sortActiveSeatMembers(
    members.filter((m) => m.status === "active" || m.status === "invited")
  );
  const removedSeatMembers = sortRemovedSeatMembers(
    members.filter((m) => m.status === "removed" || m.status === "cold_storage")
  );
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
      <SettingsSectionScope label={scopeLabel} />
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
        <Users className="h-5 w-5 text-bizzi-blue" />
        Team Management
      </h2>
      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        Invite people to your <strong className="text-neutral-900 dark:text-white">personal team</strong>, set
        their access, and share <strong className="text-neutral-900 dark:text-white">your plan storage</strong>{" "}
        with them (this isn’t an Organization). Everyone draws from the same pool; usage still counts toward
        your plan limits.
      </p>

      {!hasCapacity ? (
        <div className="mb-6 rounded-xl border border-bizzi-blue/35 bg-gradient-to-br from-cyan-50/80 to-white p-5 dark:border-bizzi-cyan/25 dark:from-cyan-950/25 dark:to-neutral-900">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Your team identity</h3>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Your team name and logo are saved. The dedicated team workspace stays locked until you activate
            it with seats.
          </p>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-600 dark:bg-neutral-800">
              {teamIdentityLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote logo URL from storage
                <img
                  src={teamIdentityLogoUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <Users className="h-9 w-9 text-bizzi-blue/50 dark:text-bizzi-cyan/60" aria-hidden />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Team name
              </p>
              <p className="truncate text-lg font-semibold text-neutral-900 dark:text-white">
                {teamIdentityName || "—"}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-neutral-700 dark:text-neutral-300">
            Purchase at least one{" "}
            <strong className="text-neutral-900 dark:text-white">extra team seat</strong> to unlock the
            team workspace and the workspace switcher. Until then, keep working in your personal workspace —
            your team identity remains here in Settings.
          </p>
          <Link
            href="/dashboard/change-plan"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan"
          >
            Add team seats
          </Link>
        </div>
      ) : null}

      <div className="mb-6 rounded-lg border border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Team overview</h3>
        <ul className="mt-3 space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
          <li>
            <span className="text-neutral-500">Owner</span>{" "}
            <span className="text-neutral-900 dark:text-white">{user?.email ?? "—"}</span>
          </li>
          <li>
            <span className="text-neutral-500">Plan</span>{" "}
            <span className="text-neutral-900 dark:text-white">{overview?.plan_label ?? "—"}</span>
          </li>
          <li>
            <span className="text-neutral-500">Extra team seats</span>{" "}
            <span className="text-neutral-900 dark:text-white">
              {purchasedExtra} purchased
              {!loading && (
                <>
                  {" · "}
                  {usedTotal} in use (members + open invites)
                  {" · "}
                  {Math.max(0, purchasedExtra - usedTotal)} available
                </>
              )}
              {loading ? " · …" : null}
            </span>
          </li>
          {typeof overview?.team_quota_bytes === "number" ? (
            <li>
              <span className="text-neutral-500">Storage</span>{" "}
              <span className="text-neutral-900 dark:text-white">
                {formatStorage(overview.team_quota_bytes)} on your plan · Team workspace{" "}
                {formatStorage(overview.team_used_bytes ?? 0)} used
              </span>
            </li>
          ) : null}
          <li className="text-xs text-neutral-500">
            You buy plan storage; teammates keep their own Bizzi accounts and billing for anything outside this
            team.
          </li>
        </ul>
      </div>

      {hasCapacity && activeSeatMembers.length === 0 && pendingInvites.length === 0 ? (
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
          className="flex flex-col gap-4"
        >
          <div className="w-full">
            <label htmlFor="team-invite-email" className="mb-1 block text-xs text-neutral-500">
              Email
            </label>
            <input
              ref={inviteEmailRef}
              id="team-invite-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              placeholder="teammate@example.com"
              autoComplete="email"
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 sm:max-w-[14rem]">
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
            <div className="min-w-0 flex-1 sm:max-w-[15rem]">
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
                      {overBudget ? " (not available)" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting || !hasCapacity}
              className="w-full shrink-0 rounded-lg bg-bizzi-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-bizzi-cyan disabled:opacity-50 sm:w-auto sm:self-end"
            >
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invite"}
            </button>
          </div>
        </form>
        {!hasCapacity && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            Purchase team seats before inviting.
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
                {activeSeatMembers.map((m) => {
                  const cap = m.storage_quota_bytes ?? null;
                  const usageLabel = `${formatStorage(m.storage_used_bytes)} of ${formatStorage(cap)} used`;
                  const memberCapBudget = maxBytesForMemberSeatEdit(m, overview);
                  return (
                    <tr key={m.id} className="border-b border-neutral-100 dark:border-neutral-800">
                      <td className="p-3">{m.email || m.invited_email || "—"}</td>
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
                                    {overBudget ? " (not available)" : ""}
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
                        <button
                          type="button"
                          onClick={() => setRemoveTarget(m)}
                          className="text-red-600 hover:underline dark:text-red-400"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {pendingInvites.length === 0 && activeSeatMembers.length === 0 && (
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

      {!loading && removedSeatMembers.length > 0 ? (
        <div className="mt-8">
          <h3 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-white">
            Removed members
          </h3>
          <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
            No team access. Invite back prefills email, tier, and a safe storage default (unlimited if their
            old cap no longer fits).
          </p>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/80">
                <tr>
                  <th className="p-3 font-medium">Email</th>
                  <th className="whitespace-nowrap p-3 font-medium">Pool storage</th>
                  <th className="p-3 font-medium">Access</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium w-28" />
                </tr>
              </thead>
              <tbody>
                {removedSeatMembers.map((m) => {
                  const cap = m.storage_quota_bytes ?? null;
                  const usageLabel = `${formatStorage(m.storage_used_bytes)} of ${formatStorage(cap)} used`;
                  return (
                    <tr key={m.id} className="border-b border-neutral-100 dark:border-neutral-800">
                      <td className="p-3">{m.email || m.invited_email || "—"}</td>
                      <td className="p-3 text-xs text-neutral-600 dark:text-neutral-400">{usageLabel}</td>
                      <td className="p-3">
                        {PERSONAL_TEAM_SEAT_ACCESS_LABELS[m.seat_access_level as PersonalTeamSeatAccess] ??
                          m.seat_access_level}
                      </td>
                      <td className="p-3">{removedSectionStatusLabel(m.status)}</td>
                      <td className="p-3">
                        {hasCapacity ? (
                          <button
                            type="button"
                            onClick={() => handleInviteBack(m)}
                            className="text-bizzi-blue hover:underline dark:text-bizzi-cyan"
                          >
                            Invite back
                          </button>
                        ) : (
                          <span className="text-xs text-neutral-500">Add seats to invite</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/dashboard/change-plan"
          className="inline-flex items-center rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
        >
          Add more seats
        </Link>
      </div>

      <div className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-700">
        <h3 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-white">Danger zone</h3>
        <p className="mb-3 max-w-2xl text-xs text-neutral-500 dark:text-neutral-400">
          Close Team Workspace shuts down this team workspace only: member access ends, pending invites are
          canceled, team files follow the normal recovery lifecycle, and your personal account stays active.
          This is not account deletion.
        </p>
        <button
          type="button"
          onClick={() => openCloseTeamWorkspace()}
          disabled={loading}
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/70"
        >
          Close Team Workspace
        </button>
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
              They will lose access to this team. Files they uploaded stay in your team workspace until you
              delete them. This does not move your whole team to cold storage.
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

      {closeModal === "preview" &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-team-title"
          >
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
              <h3 id="close-team-title" className="font-semibold text-neutral-900 dark:text-white">
                Close Team Workspace?
              </h3>
              {closePreviewLoading ? (
                <div className="mt-6 flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-bizzi-blue" aria-hidden />
                </div>
              ) : (
                <>
                  <p className="mt-2 text-xs text-amber-800 dark:text-amber-200/90">
                    {(closePreviewData?.estimate_only_note as string) ??
                      "Figures below are estimates. Confirmation applies live billing and seat data."}
                  </p>
                  {closePreviewData?.reconciliation_required ? (
                    <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
                      {(closePreviewData?.reconciliation_message as string) ??
                        "Billing needs reconciliation before you can close with seat refunds."}
                    </p>
                  ) : (
                    <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
                      <li>
                        Purchased extra seats (total):{" "}
                        <strong>{String(closePreviewData?.purchased_seats_total ?? "—")}</strong>
                      </li>
                      <li>
                        Assigned members (active / invited):{" "}
                        <strong>{String(closePreviewData?.assigned_seats ?? "—")}</strong>
                      </li>
                      <li>
                        Pending invites:{" "}
                        <strong>{String(closePreviewData?.pending_invites ?? "—")}</strong>
                      </li>
                      {closePreviewData?.current_period_end ? (
                        <li>
                          Current period ends:{" "}
                          <strong>
                            {new Date(String(closePreviewData.current_period_end)).toLocaleString()}
                          </strong>
                        </li>
                      ) : null}
                    </ul>
                  )}
                  {!closePreviewData?.reconciliation_required &&
                  closePreviewData?.credit_preview &&
                  typeof closePreviewData.credit_preview === "object" ? (
                    <p className="mt-4 text-sm text-neutral-700 dark:text-neutral-300">
                      <strong>Estimated billing impact:</strong>{" "}
                      {(closePreviewData.credit_preview as { isCredit?: boolean; amountDueCents?: number })
                        .isCredit
                        ? `About $${(((closePreviewData.credit_preview as { amountDueCents?: number }).amountDueCents ?? 0) / 100).toFixed(2)} credit toward your subscription (proration). Final amount appears on your billing history per Stripe.`
                        : "No prorated credit shown for this preview, or a charge may apply—see Stripe preview line items if listed."}
                    </p>
                  ) : null}
                  {!closePreviewData?.reconciliation_required &&
                  closePreviewData?.no_team_seat_billing ? (
                    <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
                      You have no purchased team seats on this subscription path—closure will shut down the
                      workspace without seat refunds.
                    </p>
                  ) : null}
                  <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
                    Everyone on this team loses access immediately. Pending invites are canceled. Your personal
                    account and core subscription stay active.
                  </p>
                  {closeError ? (
                    <p className="mt-3 text-sm text-red-600 dark:text-red-400">{closeError}</p>
                  ) : null}
                  <div className="mt-6 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCloseModal("none");
                        setClosePreviewData(null);
                        setCloseError(null);
                      }}
                      className="rounded-lg border border-neutral-200 px-4 py-2 text-sm dark:border-neutral-600"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(closePreviewData?.reconciliation_required) || closeSubmitting}
                      onClick={() => confirmCloseTeamWorkspace()}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                    >
                      {closeSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        "Confirm close workspace"
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}

      {closeModal === "success" &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
              <h3 className="font-semibold text-neutral-900 dark:text-white">Team workspace closed</h3>
              <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
                {closeResult?.already_closed ? (
                  <li>This workspace was already shut down.</li>
                ) : (
                  <>
                    <li>Members no longer have access.</li>
                    <li>Pending invites were canceled.</li>
                    <li>
                      Team files are in the normal recovery lifecycle (cold storage path for the container).
                    </li>
                    {typeof closeResult?.invites_cancelled === "number" ? (
                      <li>Invites canceled: {closeResult.invites_cancelled}</li>
                    ) : null}
                    {typeof closeResult?.members_revoked === "number" ? (
                      <li>Members revoked: {closeResult.members_revoked}</li>
                    ) : null}
                    {closeResult?.credit_summary ? (
                      <li>Billing: {String(closeResult.credit_summary)}</li>
                    ) : null}
                  </>
                )}
              </ul>
              <p className="mt-3 text-xs text-neutral-500">
                {String(
                  closeResult?.actual_result_note ??
                    "Final billing changes (if any) appear per Stripe processing."
                )}
              </p>
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setCloseModal("none");
                    setCloseResult(null);
                  }}
                  className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm text-white"
                >
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
    </>
  );
}
