# Key Rotation Plan

## App Encryption Key (`APP_ENCRYPTION_KEY_CURRENT`)

### When to Rotate

- Suspected compromise
- Scheduled (e.g. annually)
- Compliance requirements

### Rotation Steps

1. **Generate new key**:
   ```bash
   openssl rand -hex 32
   ```

2. **Set in environment**:
   - `APP_ENCRYPTION_KEY_PREVIOUS` = current `APP_ENCRYPTION_KEY_CURRENT` value
   - `APP_ENCRYPTION_KEY_CURRENT` = new key
   - `APP_ENCRYPTION_KEY_VERSION` = increment (e.g. 2)

3. **Deploy**: New records encrypted with new key. Old records still decrypt via `APP_ENCRYPTION_KEY_PREVIOUS`.

4. **Re-encrypt (optional)**: Background job reads records with old version, decrypts, re-encrypts with new key, writes back.

5. **After re-encryption**: Remove `APP_ENCRYPTION_KEY_PREVIOUS`, set version. Old key no longer needed.

### Compatibility

- `decryptField()` reads version from payload and uses the correct key.
- During rotation window, both keys must be available.
- Never delete the previous key until all records are re-encrypted or rotation window ends.

---

## Transfer / Gallery Password Hashes

Passwords are hashed with scrypt (salt per value). **No rotation** of hash algorithm without user re-entry: user must set a new password, which gets hashed with current parameters.

---

## CDN Secret

If compromised:

1. Generate new secret: `openssl rand -hex 32`
2. Update `CDN_SECRET` in Vercel and Cloudflare Worker.
3. Deploy both. Old signed URLs stop working after expiry (typically 1 hour).

---

## B2 Credentials

Rotate via Backblaze Console:

1. Create new application key.
2. Update `B2_ACCESS_KEY_ID` and `B2_SECRET_ACCESS_KEY`.
3. Deploy. Old key can be deleted after confirming traffic.

---

## Firebase Service Account

Rotate via Firebase Console:

1. Generate new private key.
2. Update `FIREBASE_SERVICE_ACCOUNT_JSON`.
3. Deploy. Revoke old key after verification.
