/**
 * Centralized structured logging for enterprise security / audit events.
 * Backend only; use console so log aggregators can pick up consistent event names.
 */

export type EnterpriseSecurityEventName =
  | "profile_seat_drift"
  | "enterprise_access_denied"
  | "enterprise_admin_denied"
  | "workspace_list_denied"
  | "default_for_drive_denied"
  | "transfer_org_validation_failed"
  | "recalculate_org_executed"
  | "seat_role_changed"
  | "seat_removed"
  | "org_leave"
  | "invite_accepted"
  | "invite_rate_limited";

export function logEnterpriseSecurityEvent(
  event: EnterpriseSecurityEventName,
  payload: Record<string, unknown>
): void {
  const line = JSON.stringify({
    event: `enterprise_security.${event}`,
    ts: new Date().toISOString(),
    ...payload,
  });
  if (event === "recalculate_org_executed" || event === "invite_accepted" || event === "seat_role_changed") {
    console.info(line);
  } else {
    console.warn(line);
  }
}
