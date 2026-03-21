# Access Denied — File Preview Diagnostic

This document maps your Bizzi Cloud preview delivery chain and identifies where "Access Denied" can occur. It follows the workflow:

```
Uppy upload → B2 storage → Processing (proxy/Mux) → preview-url / video-stream-url → CDN or direct B2 → Browser
```

---

## 1. What URL Does the Browser Actually See?

| Context | Source | URL Type | Expiry |
|---------|--------|----------|--------|
| **Images (preview modal)** | `useThumbnail` | Blob URL (API returns bytes) | N/A — no direct URL |
| **Videos (playback)** | `video-stream-url` | Mux (`stream.mux.com`) OR CDN/B2 | Mux: none. CDN/B2: **10 min** |
| **Videos (poster/fallback)** | `preview-url` | CDN or direct B2 | 1 hour |
| **PDF/Audio** | `preview-url` | CDN or direct B2 | 1 hour |
| **Share/Transfer previews** | Same APIs, different routes | Same logic | Shares: 1h. Transfers: **15 min** |

**Finding:** The preview URL is either a **CDN URL** (when `CDN_BASE_URL` and `CDN_SECRET` are set) or a **direct B2 presigned URL** (when CDN is not configured). Never a raw private B2 path.

---

## 2. Critical Expiry Mismatch

| API | Expiry | Risk |
|-----|--------|------|
| `preview-url` (backup, shares) | 3600 s (1 h) | Low — sufficient for typical sessions |
| `video-stream-url` (all) | **600 s (10 min)** | **High** — long videos, paused tabs, or HLS segment re-requests can fail |
| `transfers/.../preview-url` | **900 s (15 min)** | Medium — transfers may be viewed later |

**Recommendation:** Increase `STREAM_EXPIRY_SEC` (e.g., to 3600) for video streams, or implement URL refresh before expiry.

---

## 3. Video Flow: Mux vs Proxy vs Original

`video-stream-url` and gallery `video-stream-url` use this order:

1. **Mux** — if `mux_playback_id` exists and asset is `ready` → `https://stream.mux.com/{playbackId}.m3u8` (no expiry).
2. **Proxy** — if `proxies/{hash}.mp4` exists → CDN/B2 URL (10 min expiry).
3. **Original** (gallery only) — if no proxy → original B2 key with 10 min expiry.
4. **Processing** — otherwise return `{ processing: true }`.

**Risk:** If the UI shows a video and the user gets "Access Denied," the failing URL is almost certainly the **proxy or original B2/CDN URL**, not Mux (Mux is public).

---

## 4. Cloudflare Worker Path and Auth

The Worker at `CDN_BASE_URL` receives requests like:

```
GET https://cdn.bizzicloud.io/backups/uid/driveId/path/file.mp4?exp=...&sig=...
```

It:

1. Extracts `objectKey` from `decodeURIComponent(pathname.slice(1))`.
2. Validates `exp` and `sig` (HMAC of `objectKey|exp`).
3. Calls `/api/cdn-presigned?object_key=...&exp=...&sig=...`.
4. Gets a short-lived B2 presigned URL (5 min).
5. Fetches from B2, passing the **Range** header when present.
6. Returns the response with CORS headers.

**Range support:** The Worker forwards `Range` to B2, so byte-range and HLS segment requests work.

---

## 5. When CDN Is Not Configured

If `CDN_BASE_URL` or `CDN_SECRET` is missing, `getDownloadUrl` returns a **direct B2 presigned URL**.

The browser then fetches from B2 (e.g. `f003.backblazeb2.com` or similar). In that case:

- **B2 must have CORS** for `https://www.bizzicloud.io`, `https://bizzicloud.io`, and `http://localhost:3000`.
- Otherwise, video/audio and Range requests can fail with CORS errors (often reported as access issues).

---

## 6. Object Key Consistency

`verifyBackupFileAccess` checks:

- `backup_files` where `userId == uid` and `object_key == objectKey`.
- For proxy keys (`proxies/*.mp4`), it resolves the original and verifies ownership.

**Potential drift:** If `object_key` in the database differs from the actual B2 key (e.g., rename/move without update, bad migration), preview URLs will point at the wrong object or a non-existent path.

**Check:** Log the exact `objectKey` used in failing preview requests and compare with Firestore `backup_files` and B2 bucket contents.

---

## 7. Quick Diagnostic Checklist

When a user reports "Access Denied" on preview:

1. **Inspect the failing URL in DevTools → Network:**
   - Is it `stream.mux.com`? → unlikely a B2/CDN issue; check Mux asset and playback ID.
   - Is it `cdn.bizzicloud.io/...`? → CDN path; verify `exp`/`sig` and Worker logs.
   - Is it a B2 domain (e.g. `f003.backblazeb2.com`)? → CDN likely not configured; verify B2 CORS and presigned logic.

2. **HTTP status:**
   - 401 → auth/token.
   - 403 → access control or expired sig.
   - 404 → wrong object key or file missing.
   - CORS error → wrong or missing CORS on B2 or CDN.

3. **Video-specific:**
   - HLS (Mux) or progressive (proxy/original)?
   - Request headers: does the failing request include `Range`?
   - Time between page load / URL fetch and failure — is it beyond expiry (10 min for streams, 15 min for transfers)?

4. **Environment:**
   - Is `CDN_BASE_URL` set? If not, direct B2 must have CORS for your app origin(s).
   - Is `CDN_SECRET` correct and shared between app and Worker?

---

## 8. Suggested Code Improvements

1. **Extend video stream URL expiry** in `video-stream-url` routes (e.g., from 600 to 3600 seconds).
2. **Add structured logging** for preview failures (object key, status, URL type, expiry).
3. **Video error handling:** `onError` on the `<video>` element to detect load failures and optionally retry with a fresh URL.
4. **Transfer expiry:** Consider aligning `transfers/.../preview-url` with backup/share expiry (e.g., 3600 s) if users often open transfer previews later.

---

## 9. Most Likely Root Causes (Ranked)

1. **Short expiry on video stream URLs (10 min)** — user opens or pauses; playback fails later.
2. **CDN not configured** — direct B2 URL with missing or incorrect CORS.
3. **Object key mismatch** — DB `object_key` differs from B2 key.
4. **Transfer preview expiry (15 min)** — transfer links opened after delay.
