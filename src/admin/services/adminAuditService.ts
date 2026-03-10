/**
 * Admin audit service.
 * TODO: Replace with real API: fetch('/api/admin/audit', { ... })
 */

import type { AuditLogEntry } from "@/admin/types/adminAudit.types";

export async function fetchAuditLog(
  filters?: { action?: string; actorId?: string },
  page = 1,
  limit = 50
): Promise<{ entries: AuditLogEntry[]; total: number }> {
  await new Promise((r) => setTimeout(r, 400));

  const actions = [
    "admin.login",
    "account.suspend",
    "account.restore",
    "billing.status_change",
    "file.override",
  ];
  const mockEntries: AuditLogEntry[] = Array.from({ length: 80 }, (_, i) => ({
    id: `a${i + 1}`,
    actorId: "admin1",
    actorEmail: "admin@bizzicloud.com",
    action: actions[i % actions.length],
    targetType: i % 3 === 0 ? "user" : i % 3 === 1 ? "file" : "system",
    targetId: i % 3 === 0 ? `u${(i % 5) + 1}` : i % 3 === 1 ? `f${i}` : undefined,
    timestamp: new Date(Date.now() - 3600000 * (i + 1)).toISOString(),
    metadata: {},
  }));

  const start = (page - 1) * limit;
  return {
    entries: mockEntries.slice(start, start + limit),
    total: mockEntries.length,
  };
}
