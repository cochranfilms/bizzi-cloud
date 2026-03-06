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
4. Files sync automatically to Firebase Storage

**Browser support:** Chrome or Edge (File System Access API). Safari has limited support.

### Firebase Setup

1. Ensure `.env.local` has your Firebase config (see `.env.local.example`)
2. Deploy Firestore rules: `firebase deploy --only firestore:rules`
3. Deploy Storage rules: `firebase deploy --only storage`
4. Deploy Firestore indexes: `firebase deploy --only firestore:indexes`

## Stack

- Next.js 15 (App Router)
- React 19
- TypeScript
- Tailwind CSS
- Firebase (Auth, Firestore, Storage)
- Geist font

## Structure

- `src/components/` - UI components
- `src/app/` - Next.js App Router pages
- `src/context/` - AuthContext, TransferContext, BackupContext, ThemeContext
- `src/hooks/` - useFileSystemAccess
- `src/lib/` - Firebase client, sync engine, handle storage
