# Video gallery settings — field audit

Single reference for video-relevant gallery fields: schema, APIs, creator UI, public client, proofing, server enforcement, and intentional deferrals.

| Field | Schema / default | POST create | PATCH `api/galleries/[id]` | GET `/view` | Settings form | Detail / create modal | `GalleryView` | Proofing | Server | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `gallery_type` | `photo` \| `video` | `CreateGalleryModal` | — | ✓ | drives sections | ✓ | ✓ | ✓ | — | wired |
| `media_mode` / `source_format` | `final` / legacy | ✓ | ✓ | ✓ normalized | ✓ | ✓ | ✓ badges | ✓ Final/RAW | — | wired |
| `delivery_mode` | `VideoDeliveryMode`, default in `DEFAULT_VIDEO_GALLERY_SETTINGS` | ✓ | ✓ | ✓ | ✓ (informational) | partial | badge + copy only; **no product forks** | summary | — | wired |
| `download_policy` | `none` \| `all_assets` | ✓ | ✓ | ✓ | ✓ + explainer vs `download_settings` | ✓ | download gating | summary | `download`, `download-bulk-zip`, `videoGalleryAllowsClientFileDownloads` | wired |
| `download_settings` | granular toggles | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | footer actions | download routes | wired |
| `allow_comments` | default true (video defaults) | ✓ | ✓ | ✓ (`?? true`) | ✓ | — | hide rail / skip fetch | modal + rows | comments GET/POST | wired |
| `allow_favorites` | default true | ✓ | ✓ | ✓ | ✓ | — | hide hearts, bar, lists | tabs/actions | favorites GET/POST/listId | wired |
| `allow_timestamp_comments` | default false | stored | PATCHable | exposed | **not in UI** | — | **no timestamp UI** | **no** | no `timestamp_seconds` body | **deferred** — reserved |
| `client_review_instructions` | optional string | ✓ | ✓ | ✓ | ✓ | — | callout (video) | — | — | wired |
| `workflow_status` | `VideoWorkflowStatus` | ✓ | ✓ | ✓ | ✓ | — | **minimal** (not primary client signal) | chip / summary | — | wired |
| `featured_video_asset_id` | optional | ✓ | ✓ | ✓ | ✓ picker + PATCH | detail star | hero / featured | — | — | wired |
| `invoice_*` | various | ✓ | ✓ | ✓ | ✓ | — | CTA + download gate | summary | download routes | wired |
| `allow_original_downloads`, `allow_proxy_downloads` | defaults in create | persisted | PATCHable? | optional on doc | **not surfaced** | — | — | — | **not read** by download/zip routes | **deferred** — no pipeline |
| `is_downloadable` (per `gallery_assets`) | optional bool | — | — | ✓ per asset | **no per-clip admin UI** | — | per-asset download button | — | download + bulk zip **non-manager `false` → 403** | enforcement only |

## Proofing — LUT on video RAW

- Public gallery LUT behavior: unchanged.
- **Proofing** for video RAW: do **not** force-enable LUT mirroring in grid/table until `ProofingAssetCell` and hover paths are verified stable.
- **Deferred:** proofing LUT for video RAW is intentionally **off** / neutral (poster + metadata first); document-only unless a narrow stable change is added later.

## GET vs POST (comments / favorites)

- **POST** when `allow_* === false`: **403** (all requesters).
- **GET** when disabled: **non-manager** → **200** empty payload (`{ comments: [] }`, `{ lists: [] }`, list detail empty shape); **manager** (`userCanManageGalleryAsPhotographer`) → real data for proofing.

## Tests

See `src/test/gallery-client-policy-routes.integration.test.ts` for comments, favorites, and download `is_downloadable` behavior.
