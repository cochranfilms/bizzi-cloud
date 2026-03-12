#!/usr/bin/env node
/**
 * Downloads rclone binaries for macOS (arm64 + amd64) and extracts them to bin/
 * for bundling with the app. Run before `npm run dist` on macOS.
 * Binaries are signed as part of the app's distribution/notarization flow.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const RCLONE_BASE = "https://downloads.rclone.org";
const ARCHES = [
  { arch: "darwin-arm64", zip: "rclone-current-osx-arm64.zip" },
  { arch: "darwin-amd64", zip: "rclone-current-osx-amd64.zip" },
];
const BIN_DIR = path.join(__dirname, "../bin");

function download(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return download(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

async function fetchAndExtract(arch, zip) {
  const outDir = path.join(BIN_DIR, arch);
  const zipPath = path.join(BIN_DIR, zip);
  const rclonePath = path.join(outDir, "rclone");

  if (fs.existsSync(rclonePath)) {
    console.log(`${arch}: already exists, skipping`);
    return;
  }

  const url = `${RCLONE_BASE}/${zip}`;
  console.log(`${arch}: downloading from ${url}`);
  const buf = await download(url);
  fs.mkdirSync(BIN_DIR, { recursive: true });
  fs.writeFileSync(zipPath, buf);
  execSync(`unzip -o "${zipPath}" -d "${outDir}"`, { stdio: "inherit" });

  // rclone-current-osx-arm64.zip extracts to rclone-vX.Y.Z-osx-arm64/rclone
  const entries = fs.readdirSync(outDir);
  const extracted = entries.find((n) => n.startsWith("rclone-"));
  if (extracted) {
    const src = path.join(outDir, extracted, "rclone");
    const dest = path.join(outDir, "rclone");
    if (fs.existsSync(src)) {
      fs.renameSync(src, dest);
      fs.rmSync(path.join(outDir, extracted), { recursive: true });
    }
  }
  fs.unlinkSync(zipPath);
  console.log(`${arch}: done`);
}

async function main() {
  if (process.platform !== "darwin") {
    console.log("Skipping rclone download (not macOS)");
    process.exit(0);
  }

  console.log("Downloading rclone binaries for bundling...");
  for (const { arch, zip } of ARCHES) {
    await fetchAndExtract(arch, zip);
  }
  console.log("rclone binaries ready in desktop/bin/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
