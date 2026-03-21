# Identity, Scope, and Lifecycle Architecture

## Overview

Bizzi Cloud separates identity, personal workspace, organization, and membership as independent scopes. Deletion, cold storage, billing, and restore are handled at the scope level.

## Core Rule

Deleting one scope must not automatically delete other valid scopes.

- Deleting personal does not delete enterprise access
- Removing a seat does not delete personal
- Deleting an organization does not delete member identities (unless they have no remaining scopes after purge)
- Deleting an admin's personal workspace does not delete the enterprise org they administer

## Scopes

### Identity

- Firebase Auth + profile document
- One login, one email
- Full identity deletion allowed only when:
  - No personal workspace (or personal is purged)
  - No org memberships (organization_seats where user_id = uid and status = active)
  - No owned orgs (organizations where created_by = uid)
  - No legal hold / retention requirement
  - No unpaid billing / dispute lock

### Personal Workspace

- Profile fields: personal_status, storage_lifecycle_status, billing
- Files: backup_files where organization_id = null
- Lifecycle: active | past_due | grace_period | cold_storage | scheduled_delete | purged

### Organization

- organizations collection
- Lifecycle: active | past_due | grace_period | cold_storage | scheduled_delete | purged
- Org deletion: admin remove flow, 14-day deadline, cold storage migration

### Membership

- organization_seats collection
- status: pending | active
- Seat removal: admin can remove members; user can leave via POST /api/enterprise/leave

## Deletion Types

1. **Delete Personal Workspace** - Affects personal only. Preserves identity, org memberships, org access.
2. **Leave Organization** - Affects only that org membership. Preserves personal, other orgs, identity (unless last scope).
3. **Delete Organization** - Affects org workspace and members. Preserves member personal workspaces and identities.

## User Paths

| Path | Identity | Personal | Org | Key Behavior |
|------|----------|----------|-----|--------------|
| Org Admin + Personal | Yes | Yes | Admin | Delete personal → keep org; delete org → keep personal |
| Org Admin, no Personal | Yes | No | Admin | Cannot full delete while owning org; must transfer first |
| Seat Member + Personal | Yes | Yes | Member | Delete personal → keep seat; removed → keep personal |
| Seat Member, no Personal | Yes | No | Member | Removed + no other scopes → identity can be retired |
| Personal only | Yes | Yes | No | Standard lifecycle; full delete when purged |

## Org-Only Edge Case

When a user has only org membership (no personal workspace, or personal was purged) and is then removed from the org:

- Identity has no active scopes
- No `account_deletion_effective_at` is set (user did not request account deletion)
- The account-deletion-cleanup cron does not process them (it only runs for profiles past deletion deadline)
- User can sign in to an empty state; they may be re-invited to an org or create a free personal account
- Future enhancement: optional "orphaned identity" retirement (e.g. 7–30 days) for users with no scopes

## APIs

- `POST /api/account/delete` - Delete personal (when has org) or full (when no org, does not own org)
- `POST /api/account/restore-personal` - Restore personal within grace window
- `POST /api/enterprise/leave` - User leaves org (rejects if sole admin)
- `PATCH /api/enterprise/seats/[seatId]` - Admin promotes member to admin (role change) or updates storage
- `GET /api/account/workspaces` - Personal + orgs with status for workspace switcher
- `GET /api/account/status` - Personal status, enterprise orgs, redirect_to_interstitial, owns_org

## Sole Admin Rules

- Admin cannot remove self; must "Leave organization" instead
- Sole admin cannot leave until they transfer ownership (promote another member to admin) or delete the org
- Sole admin cannot full delete identity until they transfer or delete org
