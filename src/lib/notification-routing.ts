/**
 * Which workspace "surface" a notification belongs to (inbox scoping).
 * Stored as routingBucket on new docs; older docs infer from type + metadata.
 * Server-only (imports folder-share-workspace).
 */
import { parseWorkspaceTargetKey } from "@/lib/folder-share-workspace";

export type NotificationRoutingFilter = string;

const ORG_TYPES = new Set<string>([
  "org_seat_invite",
  "org_member_joined",
  "org_you_were_removed",
  "org_role_changed",
  "org_storage_quota_changed",
  "org_removal_scheduled",
]);

const TEAM_TYPES = new Set<string>([
  "personal_team_added",
  "personal_team_joined_owner",
  "personal_team_you_were_removed",
  "personal_team_member_left_owner",
]);

export function inferNotificationRoutingBucket(data: {
  type?: string;
  routingBucket?: string;
  metadata?: Record<string, unknown> | null;
}): NotificationRoutingFilter {
  if (typeof data.routingBucket === "string" && data.routingBucket.length > 0) {
    return data.routingBucket;
  }
  const t = data.type ?? "";
  const m = data.metadata ?? {};

  if (t === "file_shared" && typeof m.workspaceTargetKey === "string") {
    const p = parseWorkspaceTargetKey(m.workspaceTargetKey);
    if (p?.kind === "personal_team") return `team:${p.id}`;
    if (p?.kind === "enterprise_workspace") {
      const oid = m.targetOrganizationId as string | undefined;
      if (oid?.trim()) return `enterprise:${oid.trim()}`;
    }
  }

  if (ORG_TYPES.has(t)) {
    const oid = m.orgId as string | undefined;
    if (oid?.trim()) return `enterprise:${oid.trim()}`;
  }

  if (TEAM_TYPES.has(t)) {
    const tid = m.teamOwnerUserId as string | undefined;
    if (tid?.trim()) return `team:${tid.trim()}`;
  }

  if (
    (t === "billing_payment_failed" ||
      t === "billing_subscription_canceled" ||
      t === "billing_subscription_welcome") &&
    (m.billingScope === "org" || (typeof m.orgId === "string" && m.orgId.trim()))
  ) {
    const oid = m.orgId as string | undefined;
    if (oid?.trim()) return `enterprise:${oid.trim()}`;
  }

  return "consumer";
}

export function notificationVisibleForRouting(
  bucket: NotificationRoutingFilter,
  activeRouting: NotificationRoutingFilter
): boolean {
  return bucket === activeRouting;
}
