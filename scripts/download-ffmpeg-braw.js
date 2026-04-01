#!/usr/bin/env node
/**
 * Downloads ffmpeg-braw Linux x86_64 binary from adinbied/ffmpeg-braw releases.
 * In-house alternative: build `native/braw-proxy-cli` on a Linux worker with the
 * Blackmagic RAW SDK and install as `/opt/braw-worker/bin/ffmpeg-braw` (see that README).
 * Used for BRAW (Blackmagic RAW) proxy generation. Run on Linux or in CI before deploy.
 *
 * Usage: node scripts/download-ffmpeg-braw.js
 *
 * Output: bin/ffmpeg-braw/ffmpeg
 * Set FFMPEG_BRAW_PATH=/path/to/project/bin/ffmpeg-braw/ffmpeg in your deploy environment.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { execSync } = require("child_process");

function get(url) {
  const parsed = new URL(url);
  const mod = parsed.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.get(url, { headers: { "User-Agent": "Bizzi-Cloud" } }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return get(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

const RELEASE_URL =
  "https://github.com/adinbied/ffmpeg-braw/releases/download/prealpha0.1/ffmpeg-braw-release0.1-linuxbinaries.zip";
const BIN_DIR = path.join(__dirname, "../bin/ffmpeg-braw");
const ZIP_PATH = path.join(__dirname, "../bin/ffmpeg-braw.zip");
const EXTRACT_DIR = path.join(__dirname, "../bin/ffmpeg-braw-extract");

function download(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "Bizzi-Cloud" } }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return download(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

function findFfmpegBinary(dir) {
  const candidates = [
    path.join(dir, "ffmpeg"),
    path.join(dir, "bin", "ffmpeg"),
    path.join(dir, "usr", "bin", "ffmpeg"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === "ffmpeg" && e.isFile()) return path.join(dir, e.name);
    if (e.isDirectory()) {
      const found = findFfmpegBinary(path.join(dir, e.name));
      if (found) return found;
    }
  }
  return null;
}

async function main() {
  if (process.platform !== "linux") {
    console.log("ffmpeg-braw is Linux-only. Skipping download (current: " + process.platform + ")");
    console.log("For BRAW proxies on Linux deploy: run this script in CI or on the server.");
    process.exit(0);
  }

  const ffmpegDest = path.join(BIN_DIR, "ffmpeg");
  if (fs.existsSync(ffmpegDest)) {
    console.log("ffmpeg-braw already exists at", ffmpegDest);
    process.exit(0);
  }

  console.log("Downloading ffmpeg-braw from", RELEASE_URL, "...");
  fs.mkdirSync(path.dirname(ZIP_PATH), { recursive: true });
  const buf = await download(RELEASE_URL);
  fs.writeFileSync(ZIP_PATH, buf);

  console.log("Extracting...");
  fs.mkdirSync(EXTRACT_DIR, { recursive: true });
  execSync(`unzip -o "${ZIP_PATH}" -d "${EXTRACT_DIR}"`, { stdio: "inherit" });

  const ffmpegSrc = findFfmpegBinary(EXTRACT_DIR);
  if (!ffmpegSrc) {
    console.error("Could not find ffmpeg binary in extracted archive");
    process.exit(1);
  }

  fs.mkdirSync(BIN_DIR, { recursive: true });
  fs.copyFileSync(ffmpegSrc, ffmpegDest);
  fs.chmodSync(ffmpegDest, 0o755);

  fs.unlinkSync(ZIP_PATH);
  fs.rmSync(EXTRACT_DIR, { recursive: true, force: true });

  console.log("ffmpeg-braw installed at", ffmpegDest);
  console.log("Set FFMPEG_BRAW_PATH=" + path.resolve(ffmpegDest) + " in your deploy environment.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
