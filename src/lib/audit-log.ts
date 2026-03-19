/**
 * Audit logging for sensitive operations.
 * Logs to Firestore audit_logs collection. No PII in logs.
 */

import { getAdminFirestore } from "@/lib/firebase-admin";
import { redact } from "@/lib/safe-log";

export type AuditAction =
  | "account_export"
  | "account_delete"
  | "do_not_sell_opt_out"
  | "privacy_preferences_update"
  | "auth_failure";

export interface AuditEntry {
  action: AuditAction;
  uid?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

function sanitizeMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === "string") out[k] = redact(v);
    else if (v && typeof v === "object" && !Array.isArray(v))
      out[k] = sanitizeMetadata(v as Record<string, unknown>);
    else out[k] = v;
  }
  return out;
}

export async function writeAuditLog(entry: Omit<AuditEntry, "timestamp">): Promise<void> {
  try {
    const db = getAdminFirestore();
    const doc: AuditEntry = {
      ...entry,
      timestamp: new Date(),
    };
    if (doc.metadata) doc.metadata = sanitizeMetadata(doc.metadata);
    await db.collection("audit_logs").add(doc);
  } catch (err) {
    console.error("[audit-log] Failed to write:", err);
  }
}

export function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  const realIp = request.headers.get("x-real-ip");
  return realIp ?? null;
}
