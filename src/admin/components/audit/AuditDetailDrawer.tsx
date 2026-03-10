"use client";

import Link from "next/link";
import SideDrawer from "../shared/SideDrawer";
import { formatDateTime } from "@/admin/utils/formatDateTime";
import type { AuditLogEntry } from "@/admin/types/adminAudit.types";

interface AuditDetailDrawerProps {
  entry: AuditLogEntry | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function AuditDetailDrawer({
  entry,
  isOpen,
  onClose,
}: AuditDetailDrawerProps) {
  if (!entry) return null;

  return (
    <SideDrawer isOpen={isOpen} onClose={onClose} title={entry.action} width="md">
      <div className="space-y-6">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Event details
          </h4>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-neutral-500">Timestamp</dt>
              <dd>{formatDateTime(entry.timestamp)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Actor</dt>
              <dd>{entry.actorEmail}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Action</dt>
              <dd className="font-mono text-xs">{entry.action}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Target type</dt>
              <dd>{entry.targetType}</dd>
            </div>
            {entry.targetId && (
              <div>
                <dt className="text-neutral-500">Target ID</dt>
                <dd>
                  <Link
                    href={
                      entry.targetType === "user"
                        ? `/admin/users?highlight=${entry.targetId}`
                        : entry.targetType === "file"
                          ? `/admin/files?file=${entry.targetId}`
                          : "#"
                    }
                    className="text-bizzi-blue hover:underline dark:text-bizzi-cyan"
                  >
                    {entry.targetId} →
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </div>

        {entry.metadata && Object.keys(entry.metadata).length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Metadata
            </h4>
            <pre className="overflow-auto rounded-lg bg-neutral-100 p-3 text-xs dark:bg-neutral-800">
              {JSON.stringify(entry.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </SideDrawer>
  );
}
