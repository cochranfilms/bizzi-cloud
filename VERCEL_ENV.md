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

## Required for API auth (Backblaze uploads)

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full service account JSON as string | Firebase Console > Project Settings > Service Accounts > Generate new private key. Minify the JSON and paste as one line. |

### FIREBASE_SERVICE_ACCOUNT_JSON format

Either paste the raw JSON (minified) or escape it. Example value:
```json
{"type":"service_account","project_id":"bizzi-cloud","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-...@bizzi-cloud.iam.gserviceaccount.com","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
```
