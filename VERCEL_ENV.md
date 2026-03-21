# Vercel Environment Variables

Set these in **Vercel > Project > Settings > Environment Variables**:

**Storage architecture:** Firebase Storage = profile images only. All backup/sync file storage uses Backblaze B2.

## Required (Firebase)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase config |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase config |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase config |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Firebase config |

## Required for Backblaze B2 (sync storage)

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `B2_ACCESS_KEY_ID` | Application Key ID | B2 Console > Application Keys |
| `B2_SECRET_ACCESS_KEY` | Application Key | B2 Console > Application Keys |
| `B2_BUCKET_NAME` | Bucket name | e.g. `bizzi-cloud` |
| `B2_ENDPOINT` | S3-compatible endpoint | Bucket Settings > S3 Endpoint, e.g. `https://s3.us-west-004.backblazeb2.com` |
| `B2_REGION` | Region code | From endpoint, e.g. `us-west-004` |

### CORS (required for browser uploads)

After adding B2 env vars, run once to allow your app origin to upload to B2:

```bash
npm run b2:cors
```

Requires `B2_ENDPOINT` (e.g. `https://s3.us-east-005.backblazeb2.com`). Uses `.env.local` or env vars. Edit `scripts/set-b2-cors.mjs` to add custom domains (e.g. preview URLs).

**If uploads fail with "No Access-Control-Allow-Origin" CORS error:** Re-run `npm run b2:cors` with B2 env vars set. The script configures both B2 Native and S3-compatible CORS.

## Required for API auth (Backblaze uploads)

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full service account JSON as string | Firebase Console > Project Settings > Service Accounts > Generate new private key. Minify the JSON and paste as one line. |

### Debugging 401 on upload

Visit `https://your-app.vercel.app/api/backup/auth-status` to check: project_id match, JSON validity, and config hints.

### FIREBASE_SERVICE_ACCOUNT_JSON format

**Best method:** Download the key from Firebase Console → Service Accounts → Generate new private key. Open the `.json` file, copy everything (it’s one line), and paste into Vercel. Do not edit or reformat it.

The `private_key` field must be a quoted string with `\n` for newlines, e.g.:
`"private_key":"-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"`

If you see "No number after minus sign" – the private_key is unquoted. Paste the full JSON from the downloaded file unchanged.
