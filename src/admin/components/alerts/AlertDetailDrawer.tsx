"use client";

import SideDrawer from "../shared/SideDrawer";
import { formatDateTime } from "@/admin/utils/formatDateTime";
import StatusBadge from "../shared/StatusBadge";
import type { AdminAlert } from "@/admin/types/adminAlerts.types";
import Link from "next/link";

interface AlertDetailDrawerProps {
  alert: AdminAlert | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function AlertDetailDrawer({
  alert,
  isOpen,
  onClose,
}: AlertDetailDrawerProps) {
  if (!alert) return null;

  return (
    <SideDrawer isOpen={isOpen} onClose={onClose} title={alert.title} width="md">
      <div className="space-y-6">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Details
          </h4>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-neutral-500">Severity</dt>
              <dd>
                <StatusBadge
                  status={alert.severity}
                  severity={
                    alert.severity === "critical"
                      ? "critical"
                      : alert.severity === "warning"
                        ? "warning"
                        : "info"
                  }
                />
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Source</dt>
              <dd>{alert.source}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Timestamp</dt>
              <dd>{formatDateTime(alert.timestamp)}</dd>
            </div>
            {alert.suggestedCause && (
              <div>
                <dt className="text-neutral-500">Suggested cause</dt>
                <dd>{alert.suggestedCause}</dd>
              </div>
            )}
            {alert.recommendedAction && (
              <div>
                <dt className="text-neutral-500">Recommended action</dt>
                <dd className="font-medium">{alert.recommendedAction}</dd>
              </div>
            )}
          </dl>
        </div>

        {(alert.targetUserId || alert.targetFileId || (alert.metadata as { ticketId?: string })?.ticketId) && (
          <div className="border-t border-neutral-200 pt-4 dark:border-neutral-700">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Quick actions
            </h4>
            <div className="flex flex-wrap gap-2">
              {(alert.metadata as { ticketId?: string })?.ticketId && (
                <Link
                  href={`/admin/support?ticket=${(alert.metadata as { ticketId: string }).ticketId}`}
                  className="rounded-lg bg-bizzi-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-bizzi-cyan dark:bg-bizzi-cyan/20 dark:text-bizzi-cyan"
                >
                  View ticket
                </Link>
              )}
              {alert.targetUserId && (
                <Link
                  href={`/admin/users?highlight=${alert.targetUserId}`}
                  className="rounded-lg bg-bizzi-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-bizzi-cyan dark:bg-bizzi-cyan/20 dark:text-bizzi-cyan"
                >
                  View user
                </Link>
              )}
              {alert.targetFileId && (
                <Link
                  href={`/admin/files?file=${alert.targetFileId}`}
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  View file
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </SideDrawer>
  );
}
