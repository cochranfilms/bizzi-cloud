# K6 load and abuse tests

API load tests for the Next.js App Router. **k6 is a host dependency** — install the CLI ([installation](https://k6.io/docs/get-started/installation/)); `npm install` does not bundle k6.

**k6 does not read Next.js `.env.local`.** Use a separate file for load-test secrets.

### Local env file (recommended)

1. Copy the template: `cp k6/.env.local.example k6/.env.local`
2. Edit `k6/.env.local` — set at least `BASE_URL` and `BEARER_TOKEN` (Firebase ID JWT from the browser).
3. Run k6 with env loaded:
   ```bash
   ./scripts/k6-with-env.sh run --out json=./k6-results/notifications-smoke.json \
     -e K6_PROFILE=smoke \
     k6/notifications-load.js
   ```
   Or one-liner: `set -a && source k6/.env.local && set +a && k6 run …`

`k6/.env.local` is gitignored. Pass `-e VAR=value` after loading to override a single variable for one run.

## Guards (non-negotiable)

| Variable | Purpose |
|----------|---------|
| `K6_ALLOW_MUTATIONS=1` | Required for **data** mutations (writes to Firestore/B2, proofing POSTs, Stripe, upload session create, etc.). |
| `K6_ALLOW_ANALYTICS_MUTATIONS=1` | **Only** for analytics-style effects (currently: `GET /api/galleries/:id/view` which increments `view_count`). Does **not** unlock other write routes. |
| `K6_ALLOW_PRODUCTION=1` | Required if `BASE_URL` matches any substring in `K6_PRODUCTION_URL_SUBSTRINGS`. |
| `K6_PRODUCTION_URL_SUBSTRINGS` | Comma-separated substrings (e.g. your prod host). If unset, production URL detection is **off** — set this for real environments. |

Startup **hard-fails** if enabled mutation paths lack required `TEST_*` variables (no silent skips).

## Test data env groups

**Public:** `BASE_URL`, `GALLERY_ID`, optional `GALLERY_PASSWORD`, `SHARE_TOKEN`

**Auth:** `BEARER_TOKEN`, optional `INVALID_BEARER_TOKEN` (abuse scripts default to a junk token if unset)

**Scoped:** `DRIVE_ID`, `FILE_ID`, `ORGANIZATION_ID`, `TEAM_OWNER_ID`, `WORKSPACE_ID`

**Mutating (writes / disposable resources):** `TEST_GALLERY_ID`, `TEST_ASSET_IDS`, `TEST_DISPOSABLE_DRIVE_ID`, `TEST_BACKUP_FILE_ID` — required when the corresponding mutation flags are on.

## Safety matrix

| Script | Default safe | Mutates by default | Production OK by default |
|--------|--------------|--------------------|---------------------------|
| `gallery-public-traffic.js` | yes | no | no |
| `proofing-abuse.js` | yes | no | no |
| `auth-abuse.js` | yes | no | yes if non-mutating (still use prod substring guard) |
| `files-browser-load.js` | yes | no | yes if non-mutating |
| `upload-and-storage-load.js` | yes | no | no |
| `notifications-load.js` | yes | no | yes if non-mutating |
| `mixed-user-journey.js` | yes | no | no |
| `rate-limit-verification.js` | yes | no | no (unless you accept prod risk) |
| `bizzi-api.js` (legacy) | conditional | optional flags | no when mutation flags set |

## Profiles

`K6_PROFILE=smoke|load|spike|soak` (default `load`). You can still set `K6_EXECUTOR=ramping-vus|ramping-arrival-rate|constant-vus` to override the scenario shape (same as legacy `bizzi-api.js` behavior).

## Troubleshooting

- **`http_req_failed` at 100%** on authenticated scripts: almost always **`401 Unauthorized`** — Firebase ID tokens expire (≈1 hour). Copy a fresh `Bearer` value from DevTools → Network → any same-origin `/api/*` request (copy only the JWT, no `Bearer ` prefix in the env var value unless you enjoy double-prefix bugs).
- **Whitespace / quotes:** `BEARER_TOKEN` is **trimmed** and surrounding `'` / `"` stripped when building headers.
- **`notifications-load.js` auth probe:** `setup()` does one `GET /api/notifications?limit=1` and **fails fast** with status + JSON body if not 2xx (set `K6_SKIP_AUTH_PROBE=1` to disable).
- **Confirm status and body on all iterations:** `-e K6_DEBUG_HTTP=1` logs non-2xx responses to stderr.

## JSON output (audit runs)

```bash
mkdir -p k6-results
k6 run --out json=./k6-results/notifications-load.json \
  -e K6_PROFILE=smoke -e BASE_URL=http://localhost:3000 -e BEARER_TOKEN=YOUR_TOKEN \
  k6/notifications-load.js
```

`k6-results/` is gitignored.

## `K6_RATE_LIMIT_ROUTE` (closed enum)

Exactly **one** route per run. Allowed values:

| Value | HTTP | Path |
|-------|------|------|
| `files_filter` | GET | `/api/files/filter?search=k6&drive_id=$DRIVE_ID` |
| `drive_item_counts` | GET | `/api/files/drive-item-counts?drive_ids=$DRIVE_ID&personal=1` |

Related env:

- `K6_RATE_LIMIT_EXPECT_STATUS` (default `429`)
- `K6_RATE_LIMIT_AFTER_COOLDOWN_EXPECT_STATUS` (default `200`)
- `K6_RATE_LIMIT_COOLDOWN_MS` (default `65000`)
- `K6_RATE_LIMIT_HAMMER_REQUESTS` (default `400`)

## Scripts — required env summary

| Script | Required |
|--------|----------|
| `notifications-load.js` | `BASE_URL`, `BEARER_TOKEN` |
| `files-browser-load.js` | `BASE_URL`, `BEARER_TOKEN`, `DRIVE_ID` |
| `gallery-public-traffic.js` | `BASE_URL`, `GALLERY_ID`; `/view` needs `K6_INCLUDE_GALLERY_VIEW=1` + (`K6_ALLOW_MUTATIONS=1` or `K6_ALLOW_ANALYTICS_MUTATIONS=1`); POST needs `K6_INCLUDE_GALLERY_POST_MUTATIONS=1` + `K6_ALLOW_MUTATIONS=1` + `TEST_GALLERY_ID` + `TEST_ASSET_IDS` |
| `auth-abuse.js` | `BASE_URL` |
| `proofing-abuse.js` | `BASE_URL`, `GALLERY_ID` |
| `rate-limit-verification.js` | `BASE_URL`, `BEARER_TOKEN`, `DRIVE_ID`, `K6_RATE_LIMIT_ROUTE` |
| `upload-and-storage-load.js` | `BASE_URL`, `BEARER_TOKEN`; mutation flags need `K6_ALLOW_MUTATIONS=1` + `TEST_DISPOSABLE_DRIVE_ID` / `TEST_BACKUP_FILE_ID` as applicable |
| `mixed-user-journey.js` | `BASE_URL`, `BEARER_TOKEN`, `DRIVE_ID`, `GALLERY_ID`; optional weights `K6_MIX_WEIGHT_*` |
| `bizzi-api.js` | `BASE_URL`; mutation flags need `K6_ALLOW_MUTATIONS` + `TEST_*` |

## Legacy `bizzi-api.js`

Scenario shape is controlled by **`K6_EXECUTOR`** (`ramping-vus` default), not `K6_PROFILE`. Use `npm run k6:smoke` / `k6:ramp` / `k6:arrival` or pass `-e K6_EXECUTOR=constant-vus -e K6_VUS=5 -e K6_DURATION=45s`.

## NPM shortcuts

`npm run k6:gallery`, `k6:notifications`, `k6:files`, `k6:auth-abuse`, `k6:proofing-abuse`, `k6:rate-limit`, `k6:upload-storage`, `k6:mixed`, plus legacy `k6:smoke`, `k6:ramp`, `k6:arrival`.

Pass `-e` via shell: `k6 run -e BASE_URL=... k6/files-browser-load.js`.

## Request tags

All scripts tag requests with: `area`, `route`, `mode` (`normal`|`abuse`), `mutation` (`yes`|`no`), optional `shell`, and `name` summarizing the four.

## Custom metrics (Counters / Rate)

- `bizzi_outcome_expected_success`
- `bizzi_outcome_expected_denial`
- `bizzi_outcome_expected_throttle`
- `bizzi_outcome_unexpected_5xx`
- `bizzi_unexpected_5xx_rate`

Abuse and rate-limit scripts use `buildAbuseThresholds()` (checks + low unexpected 5xx rate).
