"use client";

import Link from "next/link";
import SideDrawer from "../shared/SideDrawer";
import { formatDateTime } from "@/admin/utils/formatDateTime";
import type { SupportTicket } from "@/admin/types/adminSupport.types";

interface SupportTicketDrawerProps {
  ticket: SupportTicket | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function SupportTicketDrawer({
  ticket,
  isOpen,
  onClose,
}: SupportTicketDrawerProps) {
  if (!ticket) return null;

  return (
    <SideDrawer isOpen={isOpen} onClose={onClose} title={ticket.subject} width="md">
      <div className="space-y-6">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Ticket details
          </h4>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-neutral-500">Priority</dt>
              <dd className="capitalize">{ticket.priority}</dd>
            </div>
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-bizzi-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-bizzi-cyan dark:bg-bizzi-cyan/20 dark:text-bizzi-cyan"
            >
              Mark in progress
            </button>
            <button
              type="button"
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Resolve
            </button>
          </div>
        </div>
      </div>
    </SideDrawer>
  );
}
