# In-app notification routing policy

This document matches the implementation in `src/lib/notification-routing.ts` (`NOTIFICATION_TYPE_ROUTING_CLASS`). It exists so product and engineering agree on **why** certain types are not scoped to the destination workspace.

## Product rule

**Invites** and **other notices the user must see before they can open (or after they lose access to) a team or org workspace** must use the **personal shell** bucket (`routing === "consumer"`, i.e. while on `/dashboard`). Otherwise the notification bell is empty until they switch context—or forever if they can no longer open that workspace.

Read-time normalization applies for those types **before** trusting any stored `routingBucket`, so historical bad writes do not require a Firestore migration.

## Intentionally routed to `consumer` (personal shell first)

| Types | Why |
|--------|-----|
| `personal_team_invited`, `org_seat_invite`, `gallery_invite` | Invitee is not in the destination workspace yet; bell on `/dashboard` must show the invite. |
| `personal_team_added` | Reserved/legacy; new member may not have opened the team workspace yet. |
| `personal_team_you_were_removed`, `org_you_were_removed` | Recipient may **no longer** access that team/org UI; destination-scoped routing would hide the notice. |

## Intentionally team-scoped (`team:{teamOwnerUserId}`)

| Types | Why |
|--------|-----|
| `personal_team_joined_owner`, `personal_team_member_left_owner` | Owner is acting in **their** team context; appropriate for the team surface. |
| Workspace-targeted `file_shared` (personal_team target) | Share belongs to that team inbox. |

## Intentionally enterprise-scoped (`enterprise:{orgId}`)

| Types | Why |
|--------|-----|
| `org_member_joined`, `org_role_changed`, `org_storage_quota_changed`, `org_removal_scheduled` | Assuming the recipient is still an active org member receiving org-context alerts. |
| Workspace-targeted `file_shared` (enterprise target + org id) | Share belongs to that org inbox. |
| Org-linked `billing_*` when metadata ties to an org | Billing is org-scoped. |

## Default consumer

Comments, hearts, transfers, proofing (non-invite), share permission events, support, lifecycle, and personal billing—global or personal context—default to `consumer`.

## Write path

`createNotification` in `src/lib/notification-service.ts` sets `routingBucket` via `inferNotificationRoutingBucket` (no pre-existing bucket). Personal-shell-first types therefore persist as `consumer` on new documents; read-time rules still correct any stale rows.
