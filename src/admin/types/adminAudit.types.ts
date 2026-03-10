/**
 * Admin audit log types.
 * TODO: Align with real Bizzi Cloud API responses.
 */

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: "user" | "file" | "subscription" | "system";
  targetId?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}
