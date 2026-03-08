# Bizzi Cloud Encryption Implementation Summary

## 1. Encryption Architecture Summary

Bizzi Cloud now uses a **layered encryption model**:

| Layer | Implementation |
|-------|----------------|
| **Transport** | HTTPS enforced via middleware; Vercel/B2/TLS by default |
| **Files at rest** | Backblaze B2 SSE-B2 (AES-256) on all uploads (single PUT, multipart, server-side) |
| **App encryption** | AES-256-GCM for sensitive metadata; key versioning for rotation |
| **Passwords** | Scrypt hashing (transfer passwords, gallery passwords/PINs); never reversible |
| **Key management** | Env vars; current/previous keys; version in payload |
| **Signed URLs** | 15 min for transfers; 5 min for CDN Worker |
| **Logging** | `safe-log.ts` redacts tokens, passwords, keys |

---

## 2. Files Created or Updated

### Created
- `src/lib/encryption.ts` – App-level encryption (`encryptField`, `decryptField`, `maybeEncryptObjectFields`, `maybeDecryptObjectFields`)
- `src/lib/invite-token.ts` – Hash invite token for storage (`hashInviteToken`)
- `src/lib/invite-lookup.ts` – Find pending seat by token (`findPendingSeatByToken` with hash + legacy support)
- `src/lib/safe-log.ts` – Redaction helpers (`redact`, `redactObject`, `safeForLog`)
- `src/app/api/transfers/[slug]/verify-password/route.ts` – Password verification endpoint
- `docs/ENCRYPTION_ARCHITECTURE.md` – Architecture documentation
- `docs/KEY_ROTATION.md` – Key rotation plan
- `docs/ENCRYPTION_TEST_PLAN.md` – Test plan
- `docs/ENCRYPTION_IMPLEMENTATION_SUMMARY.md` – This file

### Updated
- `src/middleware.ts` – HTTPS redirect for production
- `src/lib/b2.ts` – `ServerSideEncryption: "AES256"` on PutObject, CreateMultipartUpload, putObject
- `src/lib/upload-manager.ts` – `x-amz-server-side-encryption: AES256` for single-file PUT
- `src/context/BackupContext.tsx` – Same SSE header for single-file uploads
- `src/app/api/transfers/route.ts` – Store `password_hash` instead of `password`
- `src/app/api/transfers/[slug]/route.ts` – PATCH hashes password; GET returns `hasPassword`
- `src/app/api/transfers/[slug]/download/route.ts` – Verify via `verifySecret`; 15 min expiry
- `src/app/api/transfers/[slug]/preview-url/route.ts` – Same password verification; 15 min URL
- `src/app/api/transfers/[slug]/video-stream-url/route.ts` – Same password verification
- `src/types/transfer.ts` – Added `hasPassword`
- `src/components/transfer/TransferView.tsx` – Uses `hasPassword`; calls verify-password API
- `src/components/transfer/TransferPreviewModal.tsx` – Receives password from parent (unchanged usage)
- `src/components/dashboard/CreateTransferModal.tsx` – Maps `hasPassword` from API
- `src/components/dashboard/EditTransferModal.tsx` – Uses `hasPassword`; hashes on update
- `src/components/dashboard/TransferGrid.tsx` – Shows lock icon via `hasPassword`
- `src/components/dashboard/TransferAnalytics.tsx` – Shows “Password protected” via `hasPassword`
- `src/context/TransferContext.tsx` – Optimistic updates use `hasPassword`
- `.env.local.example` – App encryption env vars
- `src/app/api/enterprise/invite/route.ts` – Store `invite_token_hash` instead of `invite_token`
- `src/app/api/enterprise/accept-invite/route.ts` – Look up by hash (legacy fallback)
- `src/app/api/enterprise/invite-by-token/route.ts` – Look up by hash (legacy fallback)
- `firestore.indexes.json` – Index on `invite_token_hash` + `status`

---

## 3. Environment Variables

```bash
# Required for app-level encryption (optional; used by encryptField/decryptField)
# Generate: openssl rand -hex 32
APP_ENCRYPTION_KEY_CURRENT=<64 hex chars>
APP_ENCRYPTION_KEY_PREVIOUS=<64 hex chars>   # Optional, for rotation
APP_ENCRYPTION_KEY_VERSION=1

# Existing (unchanged)
B2_ACCESS_KEY_ID=
B2_SECRET_ACCESS_KEY=
B2_BUCKET_NAME=
B2_ENDPOINT=
B2_REGION=
CDN_SECRET=   # Or reuse B2_SECRET_ACCESS_KEY
CRON_SECRET=
FIREBASE_SERVICE_ACCOUNT_JSON=
```

---

## 4. Migration Notes

### Transfer passwords (Firestore)
- **New** transfers store `password_hash` (scrypt).
- **Existing** transfers with `password` (plaintext) still work via legacy check.
- **PATCH** with a new password stores `password_hash` and overwrites old `password`.
- Consider a one-time migration to hash remaining plaintext passwords (requires user re-entry for plaintext we no longer have).

### Backblaze B2
- **New** objects use SSE-B2.
- **Existing** objects stay as-is; B2 serves them without changes.
- No re-upload required for existing files.

---

## 5. Key Rotation Plan

See `docs/KEY_ROTATION.md`:
1. Add `APP_ENCRYPTION_KEY_PREVIOUS` = current key.
2. Set `APP_ENCRYPTION_KEY_CURRENT` = new key, increment `APP_ENCRYPTION_KEY_VERSION`.
3. Deploy; old payloads still decrypt via previous key.
4. Optionally run re-encryption.
5. Remove previous key when safe.

---

## 6. Test Plan

See `docs/ENCRYPTION_TEST_PLAN.md`:
- Encrypt/decrypt roundtrip
- Wrong key failure
- Key rotation compatibility
- Password hash verification
- Gallery PIN verification
- Transfer password verification
- Signed URL expiration
- Unauthorized access
- Multi-tenant isolation
- Safe logging redaction
- B2 SSE-B2 upload
- HTTPS enforcement

---

## 7. What Could Not Be Verified

- **Backblaze SSE-B2 compatibility** – Implemented per public docs; not run against live B2.
- **Existing Firestore `transfers`** – Assumed some docs have `password`; legacy path added.
- **Cloudflare Worker CDN** – Presigned URL expiry set in API; Worker config not inspected.
- **Firebase Auth cookies** – No cookie config seen; Secure/SameSite not changed.
- **Organization `invite_token`** – Now stored as `invite_token_hash`; legacy supported.
- **Folder share tokens** – Doc ID used as token; no change made.
- **Build** – Fails on existing `GalleryData`/`cover_position` type error; encryption changes are independent.

---

## 8. Optional Next Steps

1. **Invite token hashing** – Done. `invite_token_hash` stored; legacy `invite_token` supported.
2. **Folder share token** – Doc ID is the token; storing hash as doc ID would require broader refactor. Currently an opaque 28-char random value; lower priority.
3. **Re-encrypt migration** – Background job to hash remaining plaintext transfer passwords (would need user re-entry).
4. **Audit logging** – Add structured logs with `redactObject` for access events.
5. **SSE-C** – Add support for customer-supplied keys for higher security tiers.
