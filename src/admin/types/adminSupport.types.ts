/**
 * Admin support types.
 * TODO: Align with real Bizzi Cloud API responses.
 */

export interface SupportTicket {
  id: string;
  priority: "low" | "medium" | "high" | "urgent";
  subject: string;
  issueType: "billing" | "upload" | "storage" | "account" | "preview" | "other";
  affectedUserId: string;
  affectedUserEmail: string;
  status: "open" | "in_progress" | "resolved";
  createdAt: string;
  updatedAt: string;
}
