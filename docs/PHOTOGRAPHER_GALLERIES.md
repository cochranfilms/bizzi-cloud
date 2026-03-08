# Bizzi Cloud – Photographer Galleries

## Overview

Photographer-focused client galleries for Bizzi Cloud. Includes client galleries, proofing-ready architecture, branded delivery, and secure downloads. Built as an original Bizzi Cloud feature set (not a clone of any existing product).

## Phase 1 Implementation (Current)

### Features Delivered

- **Client galleries** – Create galleries with title, description, event date, expiration
- **Album/collection structure** – `galleries` → `gallery_assets` with optional `gallery_collections`
- **Gallery themes** – Layout presets: masonry, justified, cinematic
- **Access control**
  - Public link (anyone with link)
  - Password protected
  - Download PIN (view freely, PIN required for download)
  - Invite only (requires sign-in with invited email)
  - Expiration date
- **Download controls**
  - Allow single image download
  - Presigned B2 URLs for secure delivery
- **Watermark settings** – Schema in place; apply-in-preview planned for later
- **Share links** – Public URL `/g/[id]` (uses Firestore document ID)
- **Branded gallery pages** – Business name, accent color, welcome message in schema
- **Mobile responsive** – Responsive grid layouts
- **Analytics counters** – view_count, download_count (basic increment on view/download)

### Data Model (Firestore)

| Collection           | Purpose                                              |
|----------------------|------------------------------------------------------|
| `galleries`          | Main gallery document (title, slug, access, branding) |
| `gallery_assets`     | Links backup_files to galleries (object_key, sort)    |
| `gallery_collections`| Optional sub-groupings within a gallery              |

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/galleries` | GET | List photographer's galleries |
| `/api/galleries` | POST | Create gallery |
| `/api/galleries/[id]` | GET | Get gallery (owner) |
| `/api/galleries/[id]` | PATCH | Update gallery |
| `/api/galleries/[id]` | DELETE | Delete gallery |
| `/api/galleries/[id]/view` | GET | Public gallery view (access-checked) |
| `/api/galleries/[id]/assets` | POST | Add assets (backup_file_ids) |
| `/api/galleries/[id]/thumbnail` | GET | Image thumbnail |
| `/api/galleries/[id]/video-thumbnail` | GET | Video thumbnail |
| `/api/galleries/[id]/download` | POST | Presigned download URL |

### Frontend

- **Dashboard**: `/dashboard/galleries` – Gallery list, create, delete
- **Gallery detail**: `/dashboard/galleries/[id]` – Add assets, copy link, view public
- **Public gallery**: `/g/[id]` – Client-facing gallery with layouts, password form, download

### File Layout

```
src/
├── app/
│   ├── api/galleries/
│   │   ├── route.ts
│   │   └── [id]/
│   │       ├── route.ts
│   │       ├── assets/route.ts
│   │       ├── download/route.ts
│   │       ├── thumbnail/route.ts
│   │       ├── video-thumbnail/route.ts
│   │       └── view/route.ts
│   ├── dashboard/galleries/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   └── g/[id]/page.tsx
├── components/
│   ├── dashboard/
│   │   ├── CreateGalleryModal.tsx
│   │   └── GalleryGrid.tsx
│   └── gallery/
│       └── GalleryView.tsx
├── hooks/
│   └── useGalleries.ts
├── lib/
│   ├── gallery-access.ts
│   ├── gallery-defaults.ts
│   └── gallery-slug.ts
└── types/
    └── gallery.ts
```

### Environment Variables

No new env vars required. Uses existing:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `B2_*` (B2_ACCESS_KEY_ID, B2_SECRET_ACCESS_KEY, B2_BUCKET_NAME, B2_ENDPOINT, B2_REGION)

### Deployment

1. Deploy Firestore indexes (new indexes in `firestore.indexes.json`):

   ```bash
   firebase deploy --only firestore:indexes
   ```

2. Deploy app as usual (Vercel, etc.).

### Security Notes

- Passwords and PINs hashed with scrypt (Node crypto)
- Gallery owner always has access when authenticated
- Thumbnail/download APIs verify gallery access (password in query for GET, body for POST)
- Invite-only requires Firebase Auth token with invited email

### Recent Additions

- **Direct upload to gallery**: Drag-and-drop or click to upload photos/videos directly to a gallery. Uses a "Gallery Media" linked drive; files are added to the gallery automatically on completion.
- **Add from files**: Option to add existing backup files (from recent uploads) to a gallery.
- **Gallery settings page** (`/dashboard/galleries/[id]/settings`):
  - Basic info: title, description, event date, expiration, layout
  - Access: public, password, PIN, invite-only
  - Branding: business name, accent color, welcome message, contact email, website
  - Download options: full gallery, single, selected; free download limit
  - Watermark: enable, position, opacity (logo upload coming later)

## Phase 2 (Implemented)

- **Favorites**: Heart icon on each asset; client selects favorites, then "Save favorites list" with optional email/name
- **Favorites lists**: Stored in `favorites_lists`; photographer sees all in Proofing page
- **Comments**: Add comments on assets in the preview modal; stored in `asset_comments`
- **Proofing status**: Per-asset status (pending, selected, editing, delivered) – photographer sets in Proofing page
- **Photographer proofing dashboard** (`/dashboard/galleries/[id]/proofing`):
  - View all favorites lists (who saved what)
  - View all comments
  - Filter assets by favorited, commented
  - Update proofing status per asset
  - Export selected asset IDs to clipboard

### Phase 2 API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/galleries/[id]/favorites` | POST | Save favorites list (client) |
| `/api/galleries/[id]/favorites` | GET | List favorites (photographer: all; client: by email) |
| `/api/galleries/[id]/comments` | POST | Add comment |
| `/api/galleries/[id]/comments` | GET | List comments (optional ?asset_id=) |
| `/api/galleries/[id]/assets/[assetId]` | PATCH | Update asset (proofing_status, photographer only) |

### Phase 2 Firestore Collections

- `favorites_lists`: gallery_id, client_email, client_name, asset_ids[], created_at
- `asset_comments`: gallery_id, asset_id, client_email, client_name, body, created_at
- `gallery_assets`: add `proofing_status` field (pending | selected | editing | delivered)

### Phase 3+ (Planned)

- Full branding (logo upload, custom fonts)
- Guided client instructions panel
- PWA install support
- Store and digital sales (Phase 4)
