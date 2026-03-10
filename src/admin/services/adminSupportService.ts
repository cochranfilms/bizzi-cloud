/**
 * Admin support service.
 * TODO: Replace with real API: fetch('/api/admin/support/tickets', { ... })
 */

import type { SupportTicket } from "@/admin/types/adminSupport.types";

export async function fetchSupportTickets(
  filters?: { status?: string; priority?: string },
  page = 1,
  limit = 25
): Promise<{ tickets: SupportTicket[]; total: number }> {
  await new Promise((r) => setTimeout(r, 400));

  const mockTickets: SupportTicket[] = [
    {
      id: "t1",
      priority: "high",
      subject: "Upload failing for large video files",
      issueType: "upload",
      affectedUserId: "u2",
      affectedUserEmail: "billing@creativeco.io",
      status: "open",
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "t2",
      priority: "medium",
      subject: "Billing discrepancy on last invoice",
      issueType: "billing",
      affectedUserId: "u4",
      affectedUserEmail: "ops@filmhouse.pro",
      status: "in_progress",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "t3",
      priority: "low",
      subject: "Storage usage seems incorrect",
      issueType: "storage",
      affectedUserId: "u3",
      affectedUserEmail: "jane@example.com",
      status: "open",
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
    {
      id: "t4",
      priority: "urgent",
      subject: "Cannot access account - 403 errors",
      issueType: "account",
      affectedUserId: "u1",
      affectedUserEmail: "admin@acmestudios.com",
      status: "in_progress",
      createdAt: new Date(Date.now() - 3600000 * 30).toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  return { tickets: mockTickets, total: mockTickets.length };
}

export async function fetchSupportIssueBreakdown(): Promise<
  Record<string, number>
> {
  await new Promise((r) => setTimeout(r, 150));
  return {
    billing: 3,
    upload: 5,
    storage: 2,
    account: 1,
    preview: 1,
  };
}
