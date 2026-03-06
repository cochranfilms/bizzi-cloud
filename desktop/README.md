# Bizzi Cloud Desktop

Desktop app for mounting Bizzi Cloud as a local drive for NLE editing (Premiere Pro, DaVinci Resolve, Final Cut Pro).

## Features

- **Stream Cache**: Temporary chunk-based cache with LRU eviction (configurable 50–500 GB)
- **Local Store**: Right-click "Store Locally for Editing" to keep full copies for offline work
- **Mount Drive**: Virtual filesystem (requires macFUSE/WinFsp)

## Prerequisites

- Node.js 18+
- **macOS**: [macFUSE](https://osxfuse.github.io/) — `brew install macfuse`
- **Windows**: [WinFsp](https://winfsp.dev/)

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

Point to your Next.js backend (default: `http://localhost:3000`). Update in Settings.

## Architecture

- `electron/main.ts` — Main process, settings, IPC
- `electron/mount/` — Mount service, FUSE adapter (skeleton)
- `src/services/stream-cache-manager.ts` — LRU stream cache
- `src/services/local-store-manager.ts` — Full local copies for offline
