/**
 * Admin alerts types.
 * TODO: Align with real Bizzi Cloud API responses.
 */

export interface AdminAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  source: string;
  timestamp: string;
  suggestedCause?: string;
  recommendedAction?: string;
  targetUserId?: string;
  targetFileId?: string;
  metadata?: Record<string, unknown>;
}
