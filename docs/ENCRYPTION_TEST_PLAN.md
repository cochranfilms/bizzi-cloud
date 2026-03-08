# Encryption Test Plan

## 1. Encrypt / Decrypt Roundtrip

```ts
import { encryptField, decryptField } from "@/lib/encryption";

const plain = "sensitive-data";
const encrypted = encryptField(plain);
expect(encrypted).toMatch(/^bizzi:\d+:/);
expect(decryptField(encrypted)).toBe(plain);
```

## 2. Wrong Key Failure

- Set `APP_ENCRYPTION_KEY_CURRENT` to key A, encrypt a value.
- Change to key B (different key), try to decrypt.
- Expect error (invalid tag or decrypt failure).

## 3. Key Rotation Compatibility

- Encrypt with `APP_ENCRYPTION_KEY_CURRENT` (v1).
- Set `APP_ENCRYPTION_KEY_PREVIOUS` = old key, `APP_ENCRYPTION_KEY_CURRENT` = new key, `APP_ENCRYPTION_KEY_VERSION` = 2.
- Decrypt old payload: should succeed using `APP_ENCRYPTION_KEY_PREVIOUS`.
- Encrypt new value: should use v2, decrypt with current key.

## 4. Password Hash Verification

```ts
import { hashSecret, verifySecret } from "@/lib/gallery-access";

const pw = "test-password";
const hash = await hashSecret(pw);
expect(await verifySecret(pw, hash)).toBe(true);
expect(await verifySecret("wrong", hash)).toBe(false);
```

## 5. Gallery PIN Verification

- Create gallery with `access_mode: "pin"`, set PIN.
- `verifyGalleryDownloadAccess` with correct PIN → allowed.
- With wrong PIN → `invalid_pin`.

## 6. Transfer Password Verification

- Create transfer with password.
- `POST /api/transfers/[slug]/verify-password` with correct password → 200.
- With wrong password → 403.
- Download with correct password → URL returned.
- Download with wrong password → 403.

## 7. Signed URL Expiration

- Get presigned download URL for transfer.
- Wait until after expiry (e.g. 16 min for 15 min expiry).
- Use URL → expect 403 or equivalent from B2/CDN.

## 8. Unauthorized Access Attempts

- Request transfer download without password when transfer has password → 403.
- Request transfer for wrong user's slug (if auth required) → 403.
- Use expired transfer slug → 410.

## 9. Multi-Tenant Access Isolation

- User A creates backup file with object key `backups/uidA/...`.
- User B attempts download for same object key via API.
- `verifyBackupFileAccess(uidB, objectKey)` should deny (file belongs to uidA).

## 10. Safe Logging Redaction

```ts
import { redact, redactObject } from "@/lib/safe-log";

expect(redact("password=secret")).not.toContain("secret");
expect(redactObject({ token: "abc" }).token).toBe("[REDACTED]");
```

## 11. B2 SSE-B2 Upload

- Upload file via single PUT (small file) or multipart (large file).
- In B2 Console or via HeadObject, verify `ServerSideEncryption: AES256` on object.
- Download same object → should succeed (transparent decryption).

## 12. HTTPS Enforcement

- In production, request `http://...` → expect 301 redirect to `https://...`.

## 13. Invite Token Hashing

- Create invite → organization_seats doc has `invite_token_hash`, no plain `invite_token`.
- Accept invite with token → succeeds (lookup by hash).
- Invite-by-token GET with token → returns org details (lookup by hash).
- Legacy: Existing docs with `invite_token` still work via fallback query.
