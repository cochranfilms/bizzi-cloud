# Bizzi Cloud Upload Architecture

## Overview

Direct-to-B2 multipart uploads with adaptive part sizing, resumability, deduplication, and cost efficiency. File bytes **never** pass through Vercel.

## Stack

- **Cloudflare** – CDN and edge delivery for downloads
- **Vercel** – API endpoints only (auth, signing, metadata)
- **Backblaze B2** – Bucket storage (S3-compatible)

## Flow

1. **Client** → `POST /api/uploads/create` (auth, quota, dedupe check)
2. **API** → Returns `sessionId`, `objectKey`, `uploadId`, part URLs, `recommendedPartSize`, `recommendedConcurrency`
3. **Client** → Uploads parts directly to B2 via presigned URLs
4. **Client** → `POST /api/uploads/complete` with part ETags
5. **API** → Completes multipart, stores metadata, updates quota

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/uploads/create` | Create session, get part URLs, check dedupe |
| `POST /api/uploads/parts/batch` | Fetch additional part URLs (for 200+ parts) |
| `POST /api/uploads/complete` | Complete multipart, persist metadata |
| `POST /api/uploads/abort` | Abort multipart, clean B2 |
| `GET /api/uploads/session/[id]` | Get session state for resume |
| `GET /api/uploads/incomplete` | List user's unfinished uploads |
| `POST /api/uploads/dedupe/check` | Fast fingerprint / content-hash dedupe |
| `POST /api/uploads/cleanup` | Cron: abort stale sessions |

## Adaptive Part Sizing

| File Size | Part Size | Concurrency |
|-----------|-----------|-------------|
| < 250 MB | 8 MB | 6 |
| 250 MB – 5 GB | 32 MB | 8 |
| > 5 GB | 64 MB | 10 |

Parts stay under 10,000; part size adjusts for very large files.

## Deduplication

- **Fast fingerprint**: size + name + lastModified + sampled hash (first/middle/last 64KB)
- **Content hash**: Full SHA256 for exact dedupe (content-addressed storage)
- **Dedupe check** before upload; if match exists, create logical file record only

## Environment Variables

```
B2_ACCESS_KEY_ID=
B2_SECRET_ACCESS_KEY=
B2_BUCKET_NAME=
B2_ENDPOINT=
B2_REGION=us-west-004
FIREBASE_SERVICE_ACCOUNT_JSON=
CRON_SECRET=  # Optional: for /api/uploads/cleanup cron
```

## Why This Is Faster and Cheaper

1. **No Vercel proxy** – Files go client → B2; Vercel stays under 4.5 MB limit
2. **Larger parts** – Fewer B2 transactions for big files (Backblaze recommends ~100 MB)
3. **Parallel uploads** – 6–10 concurrent parts
4. **Deduplication** – Avoids storing duplicate content
5. **Cloudflare CDN** – Free B2 egress via Bandwidth Alliance for downloads
6. **Batch part signing** – Fewer API calls when totalParts > 200
