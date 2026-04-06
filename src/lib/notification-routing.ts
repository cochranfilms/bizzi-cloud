/**
 * Notification routing — which “surface” the bell and inbox use to filter rows.
 *
 * Product rule (read this before changing buckets):
 * ---------------------------------------------------------------------------
 * Invites and other messages the user must see *before* they can open the
 * destination workspace MUST surface in the recipient’s personal shell
 * (`routing === "consumer"`, i.e. /dashboard), not only under `team:{uid}` or
 * `enterprise:{orgId}`. Otherwise the badge stays empty until they switch
 * context — or forever if they lose access.
 *
 * We normalize at READ time: types classified `personal_shell_first` return
 * `"consumer"` *before* any stored `routingBucket` on the Firestore doc, so
 * stale buckets from older writes need no migration.
 *
 * **Developer routing table** — `NOTIFICATION_TYPE_ROUTING_CLASS` (exhaustive
 * `satisfies Record<NotificationType, …>`), `NOTIFICATION_ROUTING_POLICY_REFERENCE`,
 * and `docs/notification-routing-policy.md`.
 *
 * Server-only (imports folder-share-workspace).
 */
import type { NotificationType } from "@/types/collaboration";
import { parseWorkspaceTargetKey } from "@/lib/workspace-share-target-key";

export type NotificationRoutingFilter = string;

/** How routing is decided for each notification type (metadata may refine further). */
export type NotificationTypeRoutingClass =
  | "personal_shell_first"
  | "team_owner"
  | "enterprise_org"
  /** Bucket comes from workspaceTargetKey + org id on metadata. */
  | "file_shared"
  /** enterprise only when metadata ties to org; else consumer. */
  | "billing_org_conditional"
  /** Personal/global surface; also fallback when org/team metadata missing. */
  | "consumer_default";

/**
 * Compact reference for PRs and onboarding (derived from NOTIFICATION_TYPE_ROUTING_CLASS).
 * @see docs/notification-routing-policy.md for the product rationale.
 */
export const NOTIFICATION_ROUTING_POLICY_REFERENCE = {
  personalShellFirst:
    "Invites, loss of access, and flows before the user can open the destination workspace.",
  teamScoped:
    "Owner activity tied to a specific personal team (`team:{teamOwnerUserId}`).",
  enterpriseScoped: "Org member activity while still in org context (`enterprise:{orgId}`).",
  fileShared:
    "Workspace-targeted share inbox: personal_team → team:*, enterprise_workspace → enterprise:*.",
  billingOrgConditional:
    "billing_* types → enterprise only when metadata links to an org; else consumer.",
  defaultConsumer:
    "Comments, hearts, transfers, gallery proofing (non-invite), support, lifecycle, etc.",
} as const;

/**
 * Exhaustive map: each NotificationType is classified once. Adding a type
 * without an entry is a TypeScript error.
 *
 * ### personal_shell_first (→ consumer; ignores stored routingBucket)
 * Use **consumer** for notifications that must be seen **before** the recipient
 * can or should enter the destination workspace — and for **you were removed**
 * (recipient may no longer open that workspace).
 */
export const NOTIFICATION_TYPE_ROUTING_CLASS = {
  gallery_invite: "personal_shell_first",
  org_seat_invite: "personal_shell_first",
  personal_team_added: "personal_shell_first",
  personal_team_invited: "personal_shell_first",
  personal_team_you_were_removed: "personal_shell_first",
  personal_team_workspace_closed_member: "personal_shell_first",
  personal_team_workspace_closed_owner: "personal_shell_first",
  org_you_were_removed: "personal_shell_first",

  personal_team_joined_owner: "team_owner",
  personal_team_member_left_owner: "team_owner",

  org_member_joined: "enterprise_org",
  org_role_changed: "enterprise_org",
  org_storage_quota_changed: "enterprise_org",
  org_removal_scheduled: "enterprise_org",

  file_shared: "file_shared",
  workspace_share_delivery_request: "file_shared",

  billing_payment_failed: "billing_org_conditional",
  billing_subscription_canceled: "billing_org_conditional",
  billing_subscription_welcome: "billing_org_conditional",

  file_comment_created: "consumer_default",
  file_comment_edited: "consumer_default",
  file_reply_created: "consumer_default",
  file_hearted: "consumer_default",
  transfer_sent: "consumer_default",
  gallery_proofing_comment: "consumer_default",
  gallery_favorites_submitted: "consumer_default",
  gallery_proofing_status_updated: "consumer_default",
  share_invitee_removed: "consumer_default",
  share_link_deleted: "consumer_default",
  share_permission_downgraded: "consumer_default",
  transfer_deleted_by_sender: "consumer_default",
  transfer_expiring_soon: "consumer_default",
  lifecycle_storage_purged: "consumer_default",
  support_ticket_submitted: "consumer_default",
  support_ticket_in_progress: "consumer_default",
  support_ticket_resolved: "consumer_default",
} as const satisfies Record<NotificationType, NotificationTypeRoutingClass>;

function routingClassForStoredType(type: string | undefined): NotificationTypeRoutingClass | null {
  if (!type || !(type in NOTIFICATION_TYPE_ROUTING_CLASS)) return null;
  return NOTIFICATION_TYPE_ROUTING_CLASS[type as NotificationType];
}

/**
 * @deprecated Prefer `routingClassForStoredType` + NOTIFICATION_TYPE_ROUTING_CLASS.
 * Retained for call sites that check the personal-shell-first set by string.
 */
export const NOTIFICATION_TYPES_PERSONAL_SHELL_FIRST: ReadonlySet<string> = new Set(
  (Object.entries(NOTIFICATION_TYPE_ROUTING_CLASS) as [NotificationType, NotificationTypeRoutingClass][])
    .filter(([, c]) => c === "personal_shell_first")
    .map(([t]) => t)
);

export function isPersonalShellFirstNotificationType(type: string | undefined): boolean {
  return routingClassForStoredType(type) === "personal_shell_first";
}

export function inferNotificationRoutingBucket(data: {
  type?: string;
  routingBucket?: string;
  metadata?: Record<string, unknown> | null;
}): NotificationRoutingFilter {
  const t = data.type ?? "";
  const cls = routingClassForStoredType(t);

  if (cls === "personal_shell_first") {
    return "consumer";
  }

  if (typeof data.routingBucket === "string" && data.routingBucket.length > 0) {
    return data.routingBucket;
  }

  const m = data.metadata ?? {};

  if (cls === "file_shared" && typeof m.workspaceTargetKey === "string") {
    const p = parseWorkspaceTargetKey(m.workspaceTargetKey);
    if (p?.kind === "personal_team") return `team:${p.id}`;
    if (p?.kind === "enterprise_workspace") {
      const oid = m.targetOrganizationId as string | undefined;
      if (oid?.trim()) return `enterprise:${oid.trim()}`;
    }
  }

  if (cls === "enterprise_org") {
    const oid = m.orgId as string | undefined;
    if (oid?.trim()) return `enterprise:${oid.trim()}`;
  }

  if (cls === "team_owner") {
    const tid = m.teamOwnerUserId as string | undefined;
    if (tid?.trim()) return `team:${tid.trim()}`;
  }

  if (cls === "billing_org_conditional") {
    if (
      m.billingScope === "org" ||
      (typeof m.orgId === "string" && m.orgId.trim())
    ) {
      const oid = m.orgId as string | undefined;
      if (oid?.trim()) return `enterprise:${oid.trim()}`;
    }
  }

  return "consumer";
}

export function notificationVisibleForRouting(
  bucket: NotificationRoutingFilter,
  activeRouting: NotificationRoutingFilter
): boolean {
  return bucket === activeRouting;
}

/** Shape accepted from Firestore for filtering (bell + list APIs). */
export type NotificationRoutingDoc = {
  type?: string;
  routingBucket?: string;
  metadata?: Record<string, unknown> | null;
};

/**
 * Single gate used by notification APIs: normalized bucket vs active surface.
 */
export function notificationMatchesActiveRouting(
  doc: NotificationRoutingDoc,
  activeRouting: NotificationRoutingFilter
): boolean {
  const bucket = inferNotificationRoutingBucket(doc);
  return notificationVisibleForRouting(bucket, activeRouting);
}
