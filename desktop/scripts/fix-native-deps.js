#!/usr/bin/env node
/**
 * Removes broken symlinks in native deps that cause electron-builder to fail.
 * node-gyp creates python3 symlinks pointing to system Python; if that path
 * doesn't exist (e.g. after Python upgrade), electron-builder's copy fails.
 */
const fs = require("fs");
const path = require("path");

const PYTHON_SYMLINK = path.join(
  __dirname,
  "../node_modules/electron-macos-file-provider/build/node_gyp_bins/python3"
);

try {
  const stat = fs.lstatSync(PYTHON_SYMLINK);
  if (stat.isSymbolicLink()) {
    const target = fs.readlinkSync(PYTHON_SYMLINK);
    if (!fs.existsSync(target)) {
      fs.unlinkSync(PYTHON_SYMLINK);
      console.log("Removed broken python3 symlink (target did not exist)");
    }
  }
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}
