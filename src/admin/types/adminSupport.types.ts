/**
 * Admin support ticket row shape (API does not expose legacy `priority`).
 */

export interface SupportTicketStatusHistoryEntry {
  status: string;
  changedAt: string;
  changedBy: string;
}

export interface SupportTicket {
  id: string;
  subject: string;
  message?: string;
  issueType: "billing" | "upload" | "storage" | "account" | "preview" | "other";
  affectedUserId: string;
  affectedUserEmail: string;
  status: "open" | "in_progress" | "resolved";
  createdAt: string;
  updatedAt: string;
  statusHistory?: SupportTicketStatusHistoryEntry[];
}
