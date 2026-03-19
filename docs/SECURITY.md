# Bizzi Cloud Security Overview

This document summarizes the security controls implemented in Bizzi Cloud. For detailed encryption architecture, see [ENCRYPTION_ARCHITECTURE.md](./ENCRYPTION_ARCHITECTURE.md).

## Encryption

| Layer | Implementation |
|-------|-----------------|
| **Transport** | HTTPS everywhere. Middleware redirects HTTP→HTTPS in production. |
| **Files at rest** | Backblaze B2 SSE-B2 (AES-256, Backblaze-managed keys) on all uploads. |
| **Sensitive metadata** | App-level AES-256-GCM via `lib/encryption.ts`. |
| **Passwords/PINs** | Scrypt hashing (never reversible). |

## Authentication

- **Firebase Auth** for primary users (email/password, OAuth).
- **Client session** for gallery clients: HMAC-signed cookie (`bizzi_client_session`) after email verification.
- API routes require `Authorization: Bearer <Firebase ID token>`; server verifies via `verifyIdToken()`.
- Admin routes use `ALLOWED_ADMIN_EMAILS` allowlist.

## Security Headers

Configured in `next.config.ts`:

- `X-Frame-Options: DENY` — prevents clickjacking
- `X-Content-Type-Options: nosniff` — prevents MIME sniffing
- `Referrer-Policy: strict-origin-when-cross-origin` — limits referrer leakage
- `Permissions-Policy` — restricts camera, microphone, geolocation

## Rate Limiting

Sensitive APIs use in-memory rate limiting (`lib/rate-limit.ts`):

- `/api/account/export` — 2 requests/hour per user
- `/api/account/delete` — 3 attempts/hour per user
- `/api/account/do-not-sell` — 10/hour per user
- `/api/account/privacy` (PATCH) — 20/hour per user

## Audit Logging

Sensitive operations are logged to Firestore `audit_logs`:

- Account export
- Account deletion
- Do-not-sell opt-out
- Privacy preferences update

Logs exclude PII. See `lib/audit-log.ts`.

## Key Management

- App encryption keys: `APP_ENCRYPTION_KEY_CURRENT`, `APP_ENCRYPTION_KEY_PREVIOUS`, `APP_ENCRYPTION_KEY_VERSION`
- Key rotation: See [KEY_ROTATION.md](./KEY_ROTATION.md)
- Secrets stored in environment variables; never logged (see `lib/safe-log.ts`)

## Data Protection

- User data export and deletion available via Settings > Privacy
- CCPA "Do Not Sell" opt-out supported
- Cookie consent banner for optional analytics/functional cookies

## Incident Response

See [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md).

## Vendors

See [VENDORS.md](./VENDORS.md) for third-party services and their compliance posture.
