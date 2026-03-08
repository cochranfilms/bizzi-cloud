# Upload Pipeline Test Plan

## 1. Slow Internet

- Throttle network (Chrome DevTools → Network → Slow 3G)
- Upload 50 MB file
- Verify: progress updates, parts complete, no timeout

## 2. Network Disconnect and Resume

- Start upload of 100 MB file
- Disconnect network mid-upload
- Reconnect
- Verify: upload resumes from last completed part (when resumable flow is used)

## 3. Browser Refresh During Upload

- Start large file upload
- Refresh page
- Verify: `GET /api/uploads/incomplete` returns session; client can resume

## 4. Duplicate File Upload

- Upload file A
- Upload same file A again (same user/workspace)
- Verify: dedupe check returns existing objectKey; no B2 upload

## 5. File Over 50 GB

- Upload file > 50 GB (or mock with large size)
- Verify: adaptive part size (64–256 MB), parts < 10,000, batch part signing

## 6. Many Simultaneous Uploads

- Queue 10+ files
- Verify: concurrency control, no memory blow-up, all complete

## 7. Storage Quota Reached

- Set quota below used + upload size
- Attempt upload
- Verify: 403, user sees quota modal
