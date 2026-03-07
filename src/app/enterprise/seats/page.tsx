"use client";

import { useState, useEffect, useCallback } from "react";
import TopBar from "@/components/dashboard/TopBar";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useAuth } from "@/context/AuthContext";
import { Users, UserPlus, Loader2, Trash2 } from "lucide-react";
import ItemActionsMenu from "@/components/dashboard/ItemActionsMenu";

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
}

export default function EnterpriseSeatsPage() {
  const { org, role, refetch } = useEnterprise();
  const { user } = useAuth();
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const isAdmin = role === "admin";

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
    if (!window.confirm("Remove this user from the organization? They will lose access."))
      return;
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

                  return (
                    <li
                      key={seat.id}
                      className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
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
                      </div>
                      {canRemove && (
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
                      )}
                      {removingId === seat.id && (
                        <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
                      )}
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
