"use client";

import { useState, useEffect, useCallback } from "react";
import TopBar from "@/components/dashboard/TopBar";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useAuth } from "@/context/AuthContext";
import { Users, UserPlus, Loader2, Trash2, HardDrive } from "lucide-react";
import ItemActionsMenu from "@/components/dashboard/ItemActionsMenu";
import { useConfirm } from "@/hooks/useConfirm";
import { ENTERPRISE_OWNER_STORAGE_BYTES } from "@/lib/enterprise-constants";

interface Seat {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  email: string;
  display_name: string | null;
  status: string;
  invited_at: string | null;
  accepted_at: string | null;
  storage_quota_bytes: number | null;
  storage_used_bytes: number;
}

export default function EnterpriseSeatsPage() {
  const { org, role, refetch } = useEnterprise();
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [updatingStorageId, setUpdatingStorageId] = useState<string | null>(null);

  const isAdmin = role === "admin";

  const STORAGE_OPTIONS = [
    { label: "100 GB", value: 100 * 1024 * 1024 * 1024 },
    { label: "500 GB", value: 500 * 1024 * 1024 * 1024 },
    { label: "1 TB", value: 1024 * 1024 * 1024 * 1024 },
    { label: "2 TB", value: 2 * 1024 * 1024 * 1024 * 1024 },
    { label: "Unlimited", value: null },
  ] as const;

  const formatStorage = (bytes: number | null) =>
    bytes === null ? "Unlimited" : `${(bytes / (1024 ** 3)).toFixed(0)} GB`;

  /** Admin/owner always shows 16GB; others show their seat quota from dropdown */
  const getDisplayQuota = (seat: Seat) =>
    seat.role === "admin" ? ENTERPRISE_OWNER_STORAGE_BYTES : (seat.storage_quota_bytes ?? null);

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
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to update storage");
    } finally {
      setUpdatingStorageId(null);
    }
  };

  const fetchSeats = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/enterprise/seats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load seats");
      const data = await res.json();
      setSeats(data.seats ?? []);
    } catch {
      setSeats([]);
    } finally {
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
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setRemovingId(null);
    }
  };

  if (!org) {
    return (
      <>
        <TopBar title="Seats" />
        <main className="flex-1 overflow-auto p-6">
          <p className="text-neutral-500 dark:text-neutral-400">
            Loading organization…
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Seat management" />
      <main className="flex-1 overflow-auto p-6">
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
              <form onSubmit={handleInvite} className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value);
                    setInviteError(null);
                  }}
                  placeholder="colleague@company.com"
                  disabled={inviting}
                  className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--enterprise-primary)] disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim()}
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

          <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
              <Users className="h-5 w-5 text-[var(--enterprise-primary)]" />
              Members ({seats.length})
            </h2>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
              </div>
            ) : seats.length === 0 ? (
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

                  const isOwner = seat.role === "admin";
                  const displayQuotaBytes = isOwner
                    ? ENTERPRISE_OWNER_STORAGE_BYTES
                    : (seat.storage_quota_bytes ?? null);
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
                          {(seat.storage_used_bytes ?? 0) / (1024 ** 3) >= 1024
                            ? `${((seat.storage_used_bytes ?? 0) / (1024 ** 4)).toFixed(1)} TB`
                            : `${((seat.storage_used_bytes ?? 0) / (1024 ** 3)).toFixed(1)} GB`}{" "}
                          of {formatStorage(displayQuotaBytes)} used
                        </p>
                      </div>
                      {isAdmin && (
                        <div className="flex w-28 shrink-0 items-center justify-end gap-2">
                          {isOwner ? (
                            <span className="text-xs text-neutral-500 dark:text-neutral-400">
                              16 GB
                            </span>
                          ) : (
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
                                      : (STORAGE_OPTIONS.find((o) => String(o.value) === v)
                                          ?.value ?? null);
                                  if (quota !== undefined) handleStorageChange(seat.id, quota);
                                }}
                                disabled={updatingStorageId === seat.id}
                                className="w-full min-w-0 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                              >
                                {STORAGE_OPTIONS.map((opt) => (
                                  <option
                                    key={opt.label}
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
                          )}
                        </div>
                      )}
                      <div className="flex w-10 shrink-0 justify-end">
                        {removingId === seat.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
                        ) : canRemove ? (
                          <ItemActionsMenu
                            actions={[
                              {
                                id: "remove",
                                label: "Remove from organization",
                                icon: <Trash2 className="h-4 w-4" />,
                                onClick: () => handleRemove(seat.id, seat.user_id),
                                destructive: true,
                              },
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
        </div>
      </main>
    </>
  );
}
