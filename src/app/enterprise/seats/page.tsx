"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import TopBar from "@/components/dashboard/TopBar";
import DashboardRouteFade from "@/components/dashboard/DashboardRouteFade";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useAuth } from "@/context/AuthContext";
import { Users, UserPlus, Loader2, Trash2, HardDrive, AlertCircle, Shield } from "lucide-react";
import ItemActionsMenu from "@/components/dashboard/ItemActionsMenu";
import { useConfirm } from "@/hooks/useConfirm";
import { PRODUCT_SEAT_STORAGE_BYTES } from "@/lib/enterprise-constants";

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

const BASE_STORAGE_OPTIONS = [
  ...PRODUCT_SEAT_STORAGE_BYTES.map((value, i) => ({
    label: STORAGE_TIER_LABELS[i] ?? `${value}`,
    value: value as number,
  })),
  { label: "Unlimited (org pool)", value: null as null },
] as const;

interface Seat {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  email: string;
  display_name: string | null;
  status: string;
  quota_mode?: string;
  invited_at: string | null;
  accepted_at: string | null;
  storage_quota_bytes: number | null;
  storage_used_bytes: number;
}

type PendingInviteRow = {
  id: string;
  email: string;
  role: string;
  invited_at: string | null;
  source: string;
};

type AllocationSummary = {
  org_quota_bytes: number | null;
  org_used_bytes: number | null;
  numeric_allocated_seat_bytes: number | null;
  active_seat_count: number;
  fixed_quota_seat_count: number | null;
  unlimited_seat_count: number | null;
  remaining_numeric_allocatable_bytes: number | null;
};

export default function EnterpriseSeatsPage() {
  const { org, role, refetch } = useEnterprise();
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const [seats, setSeats] = useState<Seat[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInviteRow[]>([]);
  const [allocationSummary, setAllocationSummary] = useState<AllocationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [updatingStorageId, setUpdatingStorageId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const hasLoadedSeatsOnceRef = useRef(false);

  const isAdmin = role === "admin";

  const maxSeats = org?.max_seats;
  const usedSeats = seats.length + pendingInvites.length;
  const hasSeatLimit = typeof maxSeats === "number" && maxSeats >= 1;
  const seatsRemaining = hasSeatLimit ? Math.max(0, maxSeats - usedSeats) : null;
  const atSeatLimit = hasSeatLimit && usedSeats >= maxSeats;
  const needsSeatLimit = !hasSeatLimit;

  const formatStorage = (bytes: number | null) => {
    if (bytes === null) return "Unlimited (org pool)";
    const gb = bytes / (1024 ** 3);
    if (gb >= 1024) return `${(gb / 1024).toFixed(0)} TB`;
    return `${gb.toFixed(0)} GB`;
  };

  const selectOptionsForSeat = (seat: Seat) => {
    const cur = seat.storage_quota_bytes;
    const tierSet = new Set<number>([...PRODUCT_SEAT_STORAGE_BYTES]);
    const hasCustom = typeof cur === "number" && !tierSet.has(cur);
    const extra = hasCustom
      ? [{ label: `Current (${formatStorage(cur)})`, value: cur as number }]
      : [];
    return [...extra, ...BASE_STORAGE_OPTIONS] as { label: string; value: number | null }[];
  };

  const handleStorageChange = async (seatId: string, newQuota: number | null) => {
    if (!isAdmin) return;
    setUpdatingStorageId(seatId);
    setInviteError(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/enterprise/seats/${encodeURIComponent(seatId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ storage_quota_bytes: newQuota }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to update storage");
      await fetchSeats();
      await refetch();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to update storage");
    } finally {
      setUpdatingStorageId(null);
    }
  };

  const fetchSeats = useCallback(async () => {
    if (!user) {
      hasLoadedSeatsOnceRef.current = false;
      return;
    }
    const showLoader = !hasLoadedSeatsOnceRef.current;
    if (showLoader) setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/enterprise/seats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load seats");
      const data = await res.json();
      setSeats(data.seats ?? []);
      setPendingInvites(data.pending_invites ?? []);
      setAllocationSummary(data.allocation_summary ?? null);
    } catch {
      setSeats([]);
    } finally {
      hasLoadedSeatsOnceRef.current = true;
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSeats();
  }, [fetchSeats]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !inviteEmail.trim()) return;
    setInviteError(null);
    setInviting(true);
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/enterprise/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to invite");
      }
      const inviteLink = data.invite_link as string | undefined;
      if (inviteLink) {
        setLastInviteLink(inviteLink);
        setInviteError(null);
        setInviteSuccess("Invite sent! Share the link below with the invitee.");
        try {
          await navigator.clipboard.writeText(inviteLink);
        } catch {
          setInviteSuccess("Invite sent! Copy the link below to share.");
        }
        setTimeout(() => {
          setInviteSuccess(null);
          setLastInviteLink(null);
        }, 15000);
      }
      setInviteEmail("");
      await fetchSeats();
      await refetch();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to invite");
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (seatId: string, seatUserId: string) => {
    if (!isAdmin) return;
    if (seatUserId === user?.uid) {
      setInviteError("You cannot remove yourself. Use Leave organization instead.");
      return;
    }
    const ok = await confirm({
      message: "Remove this user from the organization? They will lose access.",
      destructive: true,
      confirmLabel: "Remove",
    });
    if (!ok) return;
    setRemovingId(seatId);
    setInviteError(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/enterprise/seats/${encodeURIComponent(seatId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to remove");
      }
      await fetchSeats();
      await refetch();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setRemovingId(null);
    }
  };

  const handlePromoteToAdmin = async (seatId: string) => {
    if (!isAdmin) return;
    setPromotingId(seatId);
    setInviteError(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/enterprise/seats/${encodeURIComponent(seatId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: "admin" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to promote");
      await fetchSeats();
      await refetch();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to promote");
    } finally {
      setPromotingId(null);
    }
  };

  const handleLeave = async () => {
    const ok = await confirm({
      message:
        "Leave this organization? You will lose access to all organization files and storage.",
      destructive: true,
      confirmLabel: "Leave organization",
    });
    if (!ok) return;
    setLeaving(true);
    setInviteError(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/enterprise/leave", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        soleAdmin?: boolean;
        suggestIdentityDeletion?: boolean;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to leave");
      }
      refetch();
      if (data.suggestIdentityDeletion) {
        window.location.href = "/dashboard/settings#privacy";
      } else {
        window.location.href = "/dashboard";
      }
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to leave");
    } finally {
      setLeaving(false);
    }
  };

  const seatsReady = !!org && (!loading || seats.length > 0);

  return (
    <>
      <TopBar title="Seat management" />
      <main className="flex-1 overflow-auto p-6">
        <DashboardRouteFade
          ready={seatsReady}
          srOnlyMessage="Loading seat management"
        >
        {org ? (
        <div className="mx-auto max-w-2xl space-y-8">
          {!isAdmin && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Only organization admins can manage seats.
              </p>
            </div>
          )}

          {isAdmin && (
            <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
                <UserPlus className="h-5 w-5 text-[var(--enterprise-primary)]" />
                Invite member
              </h2>

              {/* Seat status badge */}
              <div className="mb-4">
                {needsSeatLimit ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/50">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div>
                        <p className="font-medium text-amber-900 dark:text-amber-100">
                          Seat limit not set
                        </p>
                        <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-200">
                          Contact sales to set your organization&apos;s seat limit before inviting members.
                        </p>
                        <a
                          href="mailto:sales@bizzicloud.io"
                          className="mt-2 inline-block text-sm font-medium text-amber-700 underline hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
                        >
                          Contact sales
                        </a>
                      </div>
                    </div>
                  </div>
                ) : atSeatLimit ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/50">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div>
                        <p className="font-medium text-amber-900 dark:text-amber-100">
                          All seats used ({usedSeats} of {maxSeats})
                        </p>
                        <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-200">
                          Contact sales to add more seats before inviting new members.
                        </p>
                        <a
                          href="mailto:sales@bizzicloud.io"
                          className="mt-2 inline-block text-sm font-medium text-amber-700 underline hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
                        >
                          Contact sales to add more seats
                        </a>
                      </div>
                    </div>
                  </div>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-[var(--enterprise-primary)]/10 px-3 py-1 text-sm font-medium text-[var(--enterprise-primary)]">
                    {seatsRemaining === 1
                      ? "1 seat remaining"
                      : `${seatsRemaining} seats remaining`}
                    {" "}({usedSeats} of {maxSeats} used)
                  </span>
                )}
              </div>

              <form onSubmit={handleInvite} className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value);
                    setInviteError(null);
                  }}
                  placeholder="colleague@company.com"
                  disabled={inviting || atSeatLimit || needsSeatLimit}
                  className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--enterprise-primary)] disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim() || atSeatLimit || needsSeatLimit}
                  className="flex items-center gap-2 rounded-lg bg-[var(--enterprise-primary)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {inviting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Invite"
                  )}
                </button>
              </form>
              {inviteError && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                  {inviteError}
                </p>
              )}
              <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                The user will see the invite when they log in with this email.
              </p>
            </section>
          )}

          {isAdmin && allocationSummary ? (
            <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
              <h2 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-white">
                Organization pool
              </h2>
              <ul className="space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
                <li>
                  Total:{" "}
                  {allocationSummary.org_quota_bytes != null
                    ? `${(allocationSummary.org_quota_bytes / 1024 ** 4).toFixed(0)} TB`
                    : "—"}
                </li>
                <li>
                  Used:{" "}
                  {allocationSummary.org_used_bytes != null
                    ? `${(allocationSummary.org_used_bytes / 1024 ** 4).toFixed(2)} TB`
                    : "—"}
                </li>
                <li>
                  Fixed seat caps allocated:{" "}
                  {allocationSummary.numeric_allocated_seat_bytes != null
                    ? `${(allocationSummary.numeric_allocated_seat_bytes / 1024 ** 4).toFixed(2)} TB`
                    : "—"}
                </li>
                <li>
                  Unallocated (numeric headroom):{" "}
                  {allocationSummary.remaining_numeric_allocatable_bytes != null
                    ? `${(allocationSummary.remaining_numeric_allocatable_bytes / 1024 ** 4).toFixed(2)} TB`
                    : "—"}
                </li>
                <li className="text-xs text-neutral-500">
                  Only <strong className="font-medium">active members</strong> count toward fixed-cap totals;
                  pending invites do not reserve pool capacity.
                </li>
              </ul>
            </section>
          ) : null}

          {isAdmin && pendingInvites.length > 0 ? (
            <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-6 dark:border-amber-800 dark:bg-amber-950/30">
              <h2 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-white">
                Pending invites ({pendingInvites.length})
              </h2>
              <ul className="divide-y divide-amber-200 dark:divide-amber-900">
                {pendingInvites.map((inv) => (
                  <li key={inv.id} className="py-2 text-sm">
                    <span className="font-medium text-neutral-900 dark:text-white">{inv.email}</span>
                    <span className="ml-2 text-neutral-500">
                      {inv.role === "admin" ? "Owner invite" : "Member"}
                      {inv.source === "legacy_organization_seats" ? " (legacy)" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
              <Users className="h-5 w-5 text-[var(--enterprise-primary)]" />
              Members ({seats.length})
            </h2>
            <p className="mb-4 text-xs text-neutral-600 dark:text-neutral-400">
              The organization has one shared storage pool (total quota). Each member has a{" "}
              <strong className="font-medium text-neutral-700 dark:text-neutral-300">seat policy</strong>
              : either a fixed cap or unlimited <em>within that pool</em>. Uploads are blocked if either the
              pool or the member&apos;s cap would be exceeded.
            </p>

            {seats.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                No members yet. Invite someone to get started.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {seats.map((seat) => {
                  const isSelf = seat.user_id === user?.uid;
                  const isPending = seat.status === "pending";
                  const canRemove =
                    isAdmin && !isSelf && removingId !== seat.id;
                  const canPromote =
                    isAdmin &&
                    !isSelf &&
                    seat.role !== "admin" &&
                    !isPending &&
                    promotingId !== seat.id;

                  const displayQuotaBytes = seat.storage_quota_bytes ?? null;
                  return (
                    <li
                      key={seat.id}
                      className="group grid grid-cols-[1fr_auto_auto] items-center gap-4 py-4 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-neutral-900 dark:text-white">
                          {seat.display_name || seat.email || "—"}
                        </p>
                        <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">
                          {seat.email}
                          {isPending && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                              Pending
                            </span>
                          )}
                          {seat.role === "admin" && (
                            <span className="ml-2 rounded bg-[var(--enterprise-primary)]/20 px-1.5 py-0.5 text-xs text-[var(--enterprise-primary)]">
                              Admin
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                          <HardDrive className="h-3.5 w-3.5" />
                          {(() => {
                            const used = seat.storage_used_bytes ?? 0;
                            return used / (1024 ** 3) >= 1024
                              ? `${(used / (1024 ** 4)).toFixed(1)} TB`
                              : `${(used / (1024 ** 3)).toFixed(1)} GB`;
                          })()}{" "}
                          of {formatStorage(displayQuotaBytes)} used
                        </p>
                      </div>
                      {isAdmin && (
                        <div className="flex w-36 shrink-0 items-center justify-end gap-2">
                          <>
                            <select
                              value={
                                seat.storage_quota_bytes === null
                                  ? "unlimited"
                                  : String(seat.storage_quota_bytes)
                              }
                              onChange={(e) => {
                                const v = e.target.value;
                                const quota =
                                  v === "unlimited"
                                    ? null
                                    : (selectOptionsForSeat(seat).find((o) => String(o.value) === v)
                                        ?.value ?? null);
                                if (quota !== undefined) handleStorageChange(seat.id, quota);
                              }}
                              disabled={updatingStorageId === seat.id || isPending}
                              className="w-full min-w-0 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                            >
                              {selectOptionsForSeat(seat).map((opt) => (
                                <option
                                  key={`${opt.label}-${opt.value ?? "u"}`}
                                  value={opt.value === null ? "unlimited" : String(opt.value)}
                                >
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            {updatingStorageId === seat.id && (
                              <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
                            )}
                          </>
                        </div>
                      )}
                      <div className="flex w-10 shrink-0 justify-end">
                        {removingId === seat.id || promotingId === seat.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
                        ) : canRemove || canPromote ? (
                          <ItemActionsMenu
                            actions={[
                              ...(canPromote
                                ? [
                                    {
                                      id: "promote",
                                      label: "Make admin",
                                      icon: <Shield className="h-4 w-4" />,
                                      onClick: () => handlePromoteToAdmin(seat.id),
                                    },
                                  ]
                                : []),
                              ...(canRemove
                                ? [
                                    {
                                      id: "remove",
                                      label: "Remove from organization",
                                      icon: <Trash2 className="h-4 w-4" />,
                                      onClick: () => handleRemove(seat.id, seat.user_id),
                                      destructive: true,
                                    },
                                  ]
                                : []),
                            ]}
                            ariaLabel="Seat actions"
                            alignRight
                          />
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
            <h2 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-white">
              Your membership
            </h2>
            <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
              You can leave this organization at any time. You will lose access to all
              organization files. {isAdmin && "As an admin, you must transfer ownership to another member before leaving."}
            </p>
            <button
              type="button"
              onClick={handleLeave}
              disabled={leaving}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              {leaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Leave organization
            </button>
          </section>
        </div>
        ) : null}
        </DashboardRouteFade>
      </main>
    </>
  );
}
