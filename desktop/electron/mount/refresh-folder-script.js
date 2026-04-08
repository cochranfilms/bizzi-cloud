#!/usr/bin/env node
/**
 * Standalone script to touch directories on a FUSE mount.
 * Spawned by FileProviderService.refreshFolder to avoid main-process reentrancy
 * (reading through the mount from the same process that hosts WebDAV).
 * Usage: node refresh-folder-script.js <rootPath>
 */
const fs = require("fs");
const path = require("path");

const rootPath = process.argv[2];
if (!rootPath) process.exit(1);

async function touchDirectory(dirPath) {
  try {
    await fs.promises.stat(dirPath);
    return await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function run() {
  try {
    const rootEntries = await touchDirectory(rootPath);
    for (const entry of rootEntries.slice(0, 50)) {
      const childPath = path.join(rootPath, entry.name);
      await fs.promises.stat(childPath).catch(() => null);
      if (entry.isDirectory()) {
        await touchDirectory(childPath);
      }
    }
    await new Promise((r) => setTimeout(r, 150));
    await touchDirectory(rootPath);
  } catch {
    process.exitCode = 1;
  }
}

run().then(() => process.exit(process.exitCode || 0));
