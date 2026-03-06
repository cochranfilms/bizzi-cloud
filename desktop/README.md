# Bizzi Cloud Desktop

Desktop app for mounting Bizzi Cloud as a local drive for NLE editing (Premiere Pro, DaVinci Resolve, Final Cut Pro).

## Features

- **Stream Cache**: Temporary chunk-based cache with LRU eviction (configurable 50–500 GB)
- **Local Store**: Right-click "Store Locally for Editing" to keep full copies for offline work
- **Mount Drive**: Virtual filesystem via rclone + WebDAV (requires rclone)

## Prerequisites

- Node.js 18+
- **[rclone](https://rclone.org/downloads/)** — Install from rclone.org (macOS: **do not** use `brew install rclone`—the Homebrew build does not support mount)

## Configuration

1. Copy `.env.example` to `.env.local`
2. Add your Firebase config (same values as the web app, using `VITE_` prefix):
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - etc.

## Development

```bash
cd desktop
npm install
npm run dev          # Vite dev server
npm run electron:dev # Electron + Vite (run in another terminal: npm run dev)
```

## Build

```bash
npm run build       # Vite build + Electron compile
npm run electron    # Run built app (after build)
```

## API Base URL

Defaults to **https://bizzi-cloud.vercel.app** (production). Change in Settings if using a different backend.

## Architecture

- `electron/main.ts` — Main process, settings, IPC
- `electron/mount/` — WebDAV server (proxies to API) + rclone mount
- `src/lib/firebase.ts` — Firebase auth for desktop sign-in
- `src/services/stream-cache-manager.ts` — LRU stream cache
- `src/services/local-store-manager.ts` — Full local copies for offline
