# Bizzi Cloud Encryption Architecture

Production-ready layered encryption for Bizzi Cloud. Protects files in transit, at rest, sensitive metadata, and credentials.

## Summary

| Layer | What | How |
|-------|------|-----|
| 1 | Transport | HTTPS everywhere, middleware redirect |
| 2 | Files at rest | Backblaze B2 SSE-B2 (AES-256, Backblaze-managed keys) |
| 3 | Sensitive metadata | App-level AES-256-GCM (`lib/encryption.ts`) |
| 4 | Passwords/PINs | Scrypt hashing (never reversible) |
| 5 | Keys | Env vars, versioning, rotation support |
| 6 | Downloads | Short-lived signed URLs (15 min default) |
| 7 | Multi-tenant | User/org-scoped object keys, auth checks |
| 8 | Logging | Redaction of tokens, passwords, keys |

---

## Layer 1: Transport Security

- **HTTPS everywhere**: Vercel serves over HTTPS; middleware redirects HTTP→HTTPS in production.
- **Signed URLs**: Short expirations (15 min for transfers, 5 min for CDN Worker presigned).
- **Cookies**: Firebase Auth handles session tokens; ensure Secure and SameSite when configuring.

**Files**: `src/middleware.ts`

---

## Layer 2: File Encryption at Rest

**Backblaze B2 SSE-B2** (server-side encryption with Backblaze-managed keys):

- All `PutObjectCommand` and `CreateMultipartUploadCommand` include `ServerSideEncryption: "AES256"`.
- Single-file presigned PUT: client must send `x-amz-server-side-encryption: AES256` (handled in `upload-manager.ts` and `BackupContext.tsx`).
- Multipart: SSE set at init; parts inherit.
- Server-side uploads (thumbnails, etc.) via `putObject()` use SSE.

**Files**: `src/lib/b2.ts`, `src/lib/upload-manager.ts`, `src/context/BackupContext.tsx`

---

## Layer 3: Application-Level Encryption

For sensitive database fields (API tokens, credentials, recovery codes, private notes):

```ts
import { encryptField, decryptField, maybeEncryptObjectFields, maybeDecryptObjectFields } from "@/lib/encryption";

const encrypted = encryptField("secret-value");
const decrypted = decryptField(encrypted);

// Object helpers (skip if APP_ENCRYPTION_KEY not set)
const safe = maybeEncryptObjectFields(data, ["api_key", "recovery_token"]);
const readable = maybeDecryptObjectFields(safe, ["api_key", "recovery_token"]);
```

- AES-256-GCM, random IV per operation.
- Payload format: `bizzi:v:base64(iv|ciphertext|authTag)`.
- Supports key rotation via version in payload.

**Files**: `src/lib/encryption.ts`

---

## Layer 4: Password and PIN Storage

- **Gallery passwords/PINs**: Scrypt (`hashSecret` / `verifySecret` in `lib/gallery-access.ts`).
- **Transfer passwords**: Now hashed with same scrypt; stored as `password_hash`. Legacy `password` (plaintext) supported during migration.
- **Never** use reversible encryption for passwords or PINs.

**Files**: `src/lib/gallery-access.ts`, `src/app/api/transfers/*`, `src/app/api/galleries/*`

---

## Layer 5: Key Management

| Env Var | Purpose |
|---------|---------|
| `APP_ENCRYPTION_KEY_CURRENT` | 32-byte hex key for app-level encryption |
| `APP_ENCRYPTION_KEY_PREVIOUS` | Optional; for key rotation |
| `APP_ENCRYPTION_KEY_VERSION` | Current version number (default 1) |
| `CDN_SECRET` | HMAC for CDN signed URLs (or use B2_SECRET_ACCESS_KEY) |
| `CRON_SECRET` | Protects cron endpoints |
| `B2_ACCESS_KEY_ID`, `B2_SECRET_ACCESS_KEY` | Backblaze credentials |

Generate app key: `openssl rand -hex 32`

**Key rotation**: See `docs/KEY_ROTATION.md`.

---

## Layer 6: Download Security

- Transfer downloads: 15 min presigned URL.
- CDN Worker→B2: 5 min presigned (Worker fetches immediately).
- Access checks run before URL issuance.
- Object keys scoped by user/org.

**Files**: `src/app/api/transfers/[slug]/download/route.ts`, `src/lib/cdn.ts`, `src/app/api/cdn-presigned/route.ts`

---

## Layer 7: Multi-Tenant Security

- Object keys: `backups/{uid}/{driveId}/{path}` or `content/{sha256}`.
- API auth: `verifyIdToken()` then `verifyBackupFileAccess`, `verifyGalleryViewAccess`, etc.
- Firestore rules enforce user_id / org membership.

---

## Layer 8: Database Schema (Firestore)

| Collection | Encrypted / hashed fields |
|------------|---------------------------|
| `transfers` | `password_hash` (was `password` plaintext) |
| `galleries` | `password_hash`, `pin_hash` |
| `organization_seats` | `invite_token_hash` (hashed; legacy `invite_token` supported) |

**Migration**: Existing transfers with plaintext `password` are supported; verification uses legacy path. On next PATCH, password is hashed and stored as `password_hash`.

---

## Layer 9: Safe Logging

```ts
import { redact, redactObject, safeForLog } from "@/lib/safe-log";

console.log(redact("password=secret123"));
console.log(safeForLog(sensitiveObject, 100));
```

Never log raw secrets, decrypted values, or full JWTs.

**Files**: `src/lib/safe-log.ts`

---

## What to Encrypt Where

| Data | Storage | Method |
|------|---------|--------|
| Files in B2 | Backblaze | SSE-B2 |
| Transfer passwords | Firestore | Scrypt hash |
| Gallery passwords/PINs | Firestore | Scrypt hash |
| API tokens, recovery codes | Firestore | `encryptField()` |
| Invite tokens | Firestore | Consider `encryptField()` |

---

## Future: Enterprise Security Tiers

- Optional client-side encryption before upload.
- Customer-managed keys (SSE-C) for higher tiers.
- HSM integration for key storage.
- Audit logging with encrypted payload hashes.
