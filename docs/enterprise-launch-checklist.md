# Enterprise launch checklist

Use this before treating enterprise as production-ready: API authorization, storage semantics, contamination risks, and observability.

## Contamination & data-integrity risks

- **Profile vs seat drift**: Access is decided from `organization_seats/{orgId}_{uid}` (active + role). If `profiles.organization_id` / `organization_role` disagree, APIs should deny or repair—watch logs for `enterprise_security.profile_seat_drift`.
- **Workspace / drive scope**: Enterprise uploads and listings must stay tied to `organization_id` on drives and backup files. Any route that only checks profile org without seat truth can leak or mutate the wrong scope.
- **Transfers**: Org-scoped transfers must validate every file’s org, lifecycle, and access; failures should emit `enterprise_security.transfer_org_validation_failed`.

## Authorization matrix (server)

| Capability | Source of truth | Notes |
|------------|-----------------|--------|
| Enterprise member | `organization_seats`, `status === "active"` | Never grant on profile alone. |
| Org admin | Active seat + `role === "admin"` | Align with `resolveEnterpriseAccess` / `isOrgAdmin`. |
| Workspace list / default drive | Member + drive/workspace `organization_id` match | Denials: `workspace_list_denied`, `default_for_drive_denied`. |
| Invites, logo, seat PATCH/DELETE, recalculate-org | Active admin | Log `enterprise_admin_denied` on misuse. |
| Leave | Self-service; block sole admin | Log `enterprise_security.org_leave`. |

## Storage & reservations

- **Org pool**: Enforcement uses org-wide file bytes + pending reservations on `billing_key` `org:{orgId}`.
- **Seat allocation**: If `storage_quota_bytes` on the seat is a number, uploads also enforce `sumActiveUserOrgBackupBytes` + that user’s share of pending reservations against that cap. `null` on the seat means no per-seat cap (for that dimension).
- **Caveat**: Reservation totals are split per requesting user in software for seat caps; org-wide reservation math stays the single Firestore query + in-memory filter for the user—acceptable for current scale; Redis or composite indexes are future options if hot.

## Rate limits (invites)

- `checkInviteRateLimit` runs on invite send, accept, token lookup, and pending-invite list.
- Set **`REDIS_URL`** (standard `redis://` or TLS `rediss://`, e.g. Upstash) so limits are **shared across instances**. If unset, behavior falls back to per-process in-memory windows (fine for single-node dev).

## Client behavior

- After accepting an invite, clients set `sessionStorage` `bizzi-enterprise-org` to the returned `organization_id` so the enterprise shell picks the right org immediately.
- Seat management calls `refetch()` on `EnterpriseContext` after mutations so role/org cache stays fresh.

## Logging & audit

Search logs for:

- `enterprise_security.invite_accepted`, `seat_role_changed`, `seat_removed`, `recalculate_org_executed`
- `enterprise_security.invite_rate_limited` (429 paths)
- Denial events above for penetration-test review

## Verdict gate

Ship when:

1. Critical enterprise APIs use `resolveEnterpriseAccess` / `requireEnterprise*` (or equivalent seat-first checks).
2. Upload path enforces org pool **and** finite seat caps where configured.
3. Drift and denial events appear in log pipelines with alerts for spikes.
4. Invite rate limits documented for multi-region/instance rollout.
