# Bizzi Cloud Desktop

Desktop app for mounting Bizzi Cloud as a local drive for NLE editing (Premiere Pro, DaVinci Resolve, Final Cut Pro).

## Features

- **Mount Drive**: Virtual filesystem via rclone + WebDAV (requires rclone, macFUSE)
- **Native Sync (Beta)**: Apple File Provider—no rclone/FUSE. On-demand files in Finder under Locations.
- **Stream Cache**: Temporary chunk-based cache with LRU eviction (configurable 50–500 GB)
- **Local Store**: Right-click "Store Locally for Editing" to keep full copies for offline work

## Prerequisites

- Node.js 18+
- **[rclone](https://rclone.org/downloads/)** — Install from rclone.org (macOS: **do not** use `brew install rclone`—the Homebrew build does not support mount)
- **[macFUSE](https://osxfuse.github.io/)** — For Mount Drive on macOS. Use **5.1.3 or newer**; earlier versions (e.g. 5.1.2) have caused Finder hangs and kernel panics on recent macOS. See [macfuse/issues#1129](https://github.com/macfuse/macfuse/issues/1129) and [macfuse/issues#982](https://github.com/macfuse/macfuse/issues/982).

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
npm run dist        # Build distributable .dmg for macOS
```

### macOS “File is Damaged” / Gatekeeper

The build uses ad-hoc code signing (`identity: "-"`) so users see “unverified developer” instead of “file is damaged,” which can be bypassed via System Settings → Privacy & Security → Open Anyway.

**User workaround (existing installs):** If users already see “damaged,” run:

```bash
xattr -cr /Applications/Bizzi\ Cloud.app
```

**Full notarization (no warnings):** With an Apple Developer account, set before `npm run dist`:

- `APPLE_ID` — your Apple ID
- `APPLE_APP_SPECIFIC_PASSWORD` — app-specific password from appleid.apple.com
- `APPLE_TEAM_ID` — Team ID (optional if you have one team)
- Set `identity` in `package.json` `build.mac` to your Developer ID cert (e.g. `"Developer ID Application: Bizzi Byte (TEAM_ID)"`)

Then remove `identity: "-"` so the app is signed with your certificate and notarized.

To regenerate the volume icon from `public/logo.png`:
```bash
mkdir -p desktop/resources/icon.iconset
for size in 16 32 64 128 256 512; do sips -z $size $size public/logo.png --out desktop/resources/icon.iconset/icon_${size}x${size}.png; done
iconutil -c icns desktop/resources/icon.iconset -o desktop/resources/icon.icns
```

## API Base URL

Defaults to **https://www.bizzicloud.io** (production). Change in Settings if using a different backend.

## Debug Options (Mount Crashes)

If Finder or the app crash when the mount is active:

1. **Full Disk Access required** — The app now blocks mounting when `/Volumes` is inaccessible (EACCES). Add Bizzi Cloud to Full Disk Access in System Settings → Privacy & Security. The fallback path was disabled because it triggered `fuse_kern_chan` assertion crashes and Finder freezes.

2. **BIZZI_ENABLE_PREFETCH=true** — Prefetch is off by default (reduces macFUSE load). Enable for faster folder opens.
   ```bash
   BIZZI_DISABLE_PREFETCH=true /Applications/Bizzi\ Cloud.app/Contents/MacOS/Bizzi\ Cloud
   ```

3. **BIZZI_DISABLE_SYMLINK_FALLBACK=true** — When using BIZZI_ALLOW_FALLBACK_MOUNT, skip creating the symlink at /Volumes/BizziCloud.
   ```bash
   BIZZI_DISABLE_SYMLINK_FALLBACK=true /Applications/Bizzi\ Cloud.app/Contents/MacOS/Bizzi\ Cloud
   ```

4. **BIZZI_ALLOW_FALLBACK_MOUNT=true** — Re-enable the fallback mount path when /Volumes is inaccessible. Use with caution; it has caused system freezes in some configurations.

5. **Debug mode** — When running with `NODE_ENV=development` or unpackaged (`npm run electron:dev`), rclone runs in foreground with verbose logging. Check `desktop.log` and the terminal for mount diagnostics.

## Architecture

- `electron/main.ts` — Main process, settings, IPC
- `electron/mount/` — WebDAV server (proxies to API) + rclone mount
- `electron/file-provider/` — Native Sync via Apple File Provider (macOS)
- `src/lib/firebase.ts` — Firebase auth for desktop sign-in
- `src/services/stream-cache-manager.ts` — LRU stream cache
- `src/services/local-store-manager.ts` — Full local copies for offline

## Native Sync (File Provider)

Native Sync uses Apple File Provider to show Bizzi Cloud in Finder under **Locations** without rclone or macFUSE. The electron-macos-file-provider package provides the extension. When you run `npm run dist`, the prepare script copies the extension from the package into `PlugIns/` for embedding. If the extension is not found in the package, build it manually:

```bash
cd node_modules/electron-macos-file-provider
npm run dev:plugin
```

Then copy the resulting `.appex` from the archive into `desktop/PlugIns/`.

## macOS "File is Damaged" / Gatekeeper

The DMG is built with **ad-hoc code signing** (`identity: "-"`) so users see an "unverified developer" prompt instead of "file is damaged." They can bypass it via **System Settings → Privacy & Security → Open Anyway**, or by right-clicking the app → **Open** (first launch only).

**If users already see "damaged":** Run in Terminal after moving the app to Applications:

```bash
xattr -cr /Applications/Bizzi\ Cloud.app
```

Then open the app normally.

**To fully eliminate Gatekeeper prompts** (requires Apple Developer account $99/year):

1. Create a Developer ID Application certificate in [Apple Developer](https://developer.apple.com).
2. Generate an [app-specific password](https://support.apple.com/en-us/HT204397).
3. Set before `npm run dist`:

```bash
export CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"
export APPLE_ID="your@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="TEAM_ID"
```

4. In `package.json` mac build config, replace `"identity": "-"` with `"identity": null` (or remove it) so electron-builder uses your `CSC_NAME` certificate.

The build will then sign and notarize the app so users can open it with no prompts.
