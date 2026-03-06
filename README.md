# Bizzi Cloud

Cloud storage built for creators. One-click sync from your Bizzi Byte or any drive to the cloud.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Sync Feature

1. Sign in at `/login`
2. Go to the dashboard and click **"Sync drive"** (or **"Sync"** if already linked)
3. Select your Bizzi Byte or any drive/folder via the directory picker
4. Files sync to **Backblaze B2** (backup storage)

**Browser support:** Chrome or Edge (File System Access API). Safari has limited support.

### Storage Architecture

- **Backblaze B2**: All backup/sync file storage
- **Firebase Storage**: Profile images only
- **Firestore**: Metadata (drives, snapshots, file listings)

### Firebase Setup

1. Ensure `.env.local` has your Firebase config (see `.env.local.example`)
2. Deploy Firestore rules: `firebase deploy --only firestore:rules`
3. Deploy Storage rules: `firebase deploy --only storage` (profile images path)
4. Deploy Firestore indexes: `firebase deploy --only firestore:indexes`

### Backblaze B2 Setup (required for sync)

1. Create a bucket in Backblaze B2
2. Create an Application Key with Read and Write access
3. Add B2 env vars to Vercel (see `VERCEL_ENV.md`)

### Troubleshooting: "Missing or insufficient permissions"

- **Firestore**: Deploy rules and indexes: `firebase deploy --only firestore:rules` and `firebase deploy --only firestore:indexes`
- **Auth/upload fails**: Sign out and back in to refresh your token. On Vercel, ensure `FIREBASE_SERVICE_ACCOUNT_JSON` is set for the upload API to verify tokens.
- **Local dev**: Add `B2_SKIP_AUTH_FOR_TESTING=true` in `.env.local` to test B2 without a service account key (dev only)

## Stack

- Next.js 15 (App Router)
- React 19
- TypeScript
- Tailwind CSS
- Firebase (Auth, Firestore, profile images)
- Backblaze B2 (file backup storage)
- Geist font

## Structure

- `src/components/` - UI components
- `src/app/` - Next.js App Router pages
- `src/context/` - AuthContext, TransferContext, BackupContext, ThemeContext
- `src/hooks/` - useFileSystemAccess
- `src/lib/` - Firebase client, sync engine, handle storage
