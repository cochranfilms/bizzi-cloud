#!/usr/bin/env node
/**
 * Copies the File Provider extension from electron-macos-file-provider into PlugIns/
 * so electron-builder can embed it. Run before `npm run dist` on macOS.
 */
const fs = require("fs");
const path = require("path");

const EXTENSION_SOURCE = path.join(
  __dirname,
  "../node_modules/electron-macos-file-provider/archive/EFPHelper.xcarchive/Products/Applications/EFPHelper.app/Contents/PlugIns/EleFileProvider.appex"
);
const PLUGINS_DIR = path.join(__dirname, "../PlugIns");
const EXTENSION_DEST = path.join(PLUGINS_DIR, "EleFileProvider.appex");

if (process.platform !== "darwin") {
  console.log("Skipping File Provider setup (not macOS)");
  process.exit(0);
}

if (!fs.existsSync(EXTENSION_SOURCE)) {
  console.warn(
    "File Provider extension not found at",
    EXTENSION_SOURCE,
    "\nRun: cd node_modules/electron-macos-file-provider && npm run dev:plugin"
  );
  process.exit(0);
}

fs.mkdirSync(PLUGINS_DIR, { recursive: true });
if (fs.statSync(EXTENSION_SOURCE).isDirectory()) {
  const destDir = path.join(PLUGINS_DIR, "EleFileProvider.appex");
  if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true });
  fs.cpSync(EXTENSION_SOURCE, destDir, { recursive: true });
} else {
  fs.copyFileSync(EXTENSION_SOURCE, EXTENSION_DEST);
}
console.log("Copied EleFileProvider.appex to PlugIns/");
