# Performance & Scale Patches — Pre-Release (2,000+ Users)

Applied fixes based on the BizziCloud Performance & Infrastructure Guide (March 2026).

## Summary

| Category | Issue | Fix |
|----------|-------|-----|
| **Critical** | `file_comments` loaded globally (all users) in files filter | Scoped to user's files only; batch query by `fileId in [...]` |
| **Critical** | `folder_shares` unbounded in files filter | Added `limit(500)` |
| **Critical** | Rate limiting on only 4 endpoints | Added rate limiting to `files/filter` (120/min) and `backup/preview-url` (300/min) |
| **High** | Page size cap 100 (PDF recommends 20–50) | Reduced to 50 max |
| **High** | Admin routes: unbounded collection reads | Added limits to profiles (10k), orgs (1k), support breakdown (2k) |
| **High** | Admin pagination: no page cap | Capped at page 50, limit 50 for support/files/audit |
| **Medium** | Proxy lookup in `backup-access` used 2000-doc batches | Reduced to 500-doc batches for faster iteration |

---

## Files Changed

- `src/app/api/files/filter/route.ts` — Scoped commented filter, rate limit, page size cap, folder_shares limit
- `src/app/api/admin/storage/route.ts` — Limits on profiles/orgs
- `src/app/api/admin/support/route.ts` — Breakdown limit, pagination caps
- `src/app/api/admin/files/route.ts` — Pagination caps
- `src/app/api/admin/audit/route.ts` — Pagination caps
- `src/app/api/backup/preview-url/route.ts` — Rate limiting
- `src/lib/backup-access.ts` — Smaller batch size for proxy lookup

---

## What Was NOT Changed (Per Your Request)

- **Infrastructure** — No Cloudflare/R2/CDN changes
- **Backend connections** — No Supabase, PgBouncer, or pooling (you use Firestore)
- **Redis/Upstash** — Not added (would need env/config)
- **Sentry** — Not added (would need setup)

---

## Remaining Recommendations (From PDF)

Apply these outside of code (infra/config):

1. **Cloudflare Pro + R2** — File delivery via CDN (you have CDN_BASE_URL for B2 already)
2. **Upstash Redis** — Replace in-memory rate limit with Redis for cross-instance limits on Vercel
3. **Sentry** — Add error tracking
4. **Better Uptime** — Uptime monitoring
5. **Firestore indexes** — Run `firebase deploy --only firestore:indexes` after adding `file_comments` `fileId in` if needed (Firestore may auto-create)

---

## Testing

- `npm run build` — Passes ✓
