"use client";

import { useState } from "react";
import Link from "next/link";
import SideDrawer from "../shared/SideDrawer";
import { formatDateTime } from "@/admin/utils/formatDateTime";
import { useAuth } from "@/context/AuthContext";
import type { SupportTicket } from "@/admin/types/adminSupport.types";

interface SupportTicketDrawerProps {
  ticket: SupportTicket | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

export default function SupportTicketDrawer({
  ticket,
  isOpen,
  onClose,
  onUpdated,
}: SupportTicketDrawerProps) {
  const { user } = useAuth();
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateStatus = async (status: "in_progress" | "resolved") => {
    if (!ticket || !user) return;
    setUpdating(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/support/${ticket.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Update failed");
      }
      onUpdated?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setUpdating(false);
    }
  };

  if (!ticket) return null;

  return (
    <SideDrawer isOpen={isOpen} onClose={onClose} title={ticket.subject} width="md">
      <div className="space-y-6">
        {ticket.message && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Message
            </h4>
            <p className="whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-800">
              {ticket.message}
            </p>
          </div>
        )}
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Ticket details
          </h4>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-neutral-500">Issue type</dt>
              <dd className="capitalize">{ticket.issueType}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Status</dt>
              <dd className="capitalize">{ticket.status.replace("_", " ")}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Created</dt>
              <dd>{formatDateTime(ticket.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Last update</dt>
              <dd>{formatDateTime(ticket.updatedAt)}</dd>
            </div>
          </dl>
        </div>

        {ticket.statusHistory && ticket.statusHistory.length > 0 ? (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Status history
            </h4>
            <ul className="space-y-2 text-sm">
              {ticket.statusHistory.map((e, i) => (
                <li
                  key={`${e.changedAt}-${i}`}
                  className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700"
                >
                  <span className="font-medium capitalize">{e.status.replace("_", " ")}</span>
                  <span className="text-neutral-500 dark:text-neutral-400">
                    {" "}
                    — {formatDateTime(e.changedAt)}
                    {e.changedBy ? ` · ${e.changedBy}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Affected user
          </h4>
          <p className="text-sm">{ticket.affectedUserEmail}</p>
          <Link
            href={`/admin/users?highlight=${ticket.affectedUserId}`}
            className="mt-1 inline-block text-sm text-bizzi-blue hover:underline dark:text-bizzi-cyan"
          >
            View in Users →
          </Link>
        </div>

        <div className="border-t border-neutral-200 pt-4 dark:border-neutral-700">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Actions
          </h4>
          {error && (
            <p className="mb-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void updateStatus("in_progress")}
              disabled={updating || ticket.status === "in_progress"}
              className="rounded-lg bg-bizzi-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-bizzi-cyan disabled:opacity-50 dark:bg-bizzi-cyan/20 dark:text-bizzi-cyan"
            >
              Mark in progress
            </button>
            <button
              type="button"
              onClick={() => void updateStatus("resolved")}
              disabled={updating || ticket.status === "resolved"}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Resolve
            </button>
          </div>
        </div>
      </div>
    </SideDrawer>
  );
}
