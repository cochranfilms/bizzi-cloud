#!/usr/bin/env node
/**
 * BRAW proxy worker: poll /api/workers/braw-proxy/claim → download .braw → transcode → PUT → complete.
 *
 * Env (required):
 *   BIZZI_API_BASE — e.g. https://your-app.vercel.app (no trailing slash)
 *   MEDIA_BRAW_WORKER_SECRET    — same as Vercel
 *
 * Decoder (one required):
 *   FFMPEG_BRAW_PATH            — ffmpeg-braw fork (adinbied) or wrapper; ffmpeg-style CLI
 *   BRAW_PROXY_CLI_BIN          — native braw-proxy-cli (Blackmagic SDK) built from native/braw-proxy-cli
 *
 * Optional:
 *   WORKER_ID                   — stable id per instance
 *   PROXY_FFMPEG_PRESET         — libx264 preset when using FFMPEG_BRAW_PATH (default: veryfast)
 *   ENCODER_FFMPEG_PATH         — stock ffmpeg for BRAW_PROXY_CLI_BIN internal encode (default: /usr/bin/ffmpeg)
 *   BRAW_PROXY_WIDTH            — width passed to CLI (default: 1280)
 *
 * Example:
 *   BIZZI_API_BASE=https://example.com MEDIA_BRAW_WORKER_SECRET=xxx FFMPEG_BRAW_PATH=/opt/braw-worker/bin/ffmpeg-braw node scripts/braw-proxy-worker.mjs
 */
import { spawn } from "child_process";
import { createReadStream, createWriteStream, constants as fsConstants } from "fs";
import { stat, access, unlink } from "fs/promises";
import * as http from "node:http";
import * as nodeHttps from "node:https";
import { tmpdir } from "os";
import { join, basename } from "path";
import { finished } from "stream/promises";
import { postWorkerJson } from "./media-worker-http.mjs";

const base = (process.env.BIZZI_API_BASE || "").replace(/\/$/, "");
const secret = process.env.MEDIA_BRAW_WORKER_SECRET || "";
const workerId = process.env.WORKER_ID || `${process.env.HOSTNAME || "worker"}-${process.pid}`;
const preset = process.env.PROXY_FFMPEG_PRESET || "veryfast";
const ffmpegBrawPath = (process.env.FFMPEG_BRAW_PATH || "").trim();
const brawCliBin = (process.env.BRAW_PROXY_CLI_BIN || "").trim();
const encoderFfmpeg = (process.env.ENCODER_FFMPEG_PATH || "/usr/bin/ffmpeg").trim();
const brawProxyWidth = Math.max(
  320,
  parseInt(String(process.env.BRAW_PROXY_WIDTH || "1280"), 10) || 1280
);

if (!base || !secret) {
  console.error("Set BIZZI_API_BASE and MEDIA_BRAW_WORKER_SECRET");
  process.exit(1);
}
if (!ffmpegBrawPath && !brawCliBin) {
  console.error("Set FFMPEG_BRAW_PATH (ffmpeg-braw) and/or BRAW_PROXY_CLI_BIN (native braw-proxy-cli)");
  process.exit(1);
}

console.log(
  "[braw-proxy-worker] config",
  JSON.stringify({
    worker_id: workerId,
    decoder: brawCliBin ? "BRAW_PROXY_CLI_BIN" : "FFMPEG_BRAW_PATH",
    braw_cli: brawCliBin || null,
    ffmpeg_braw: ffmpegBrawPath || null,
    encoder_ffmpeg: brawCliBin ? encoderFfmpeg : null,
    width: brawCliBin ? brawProxyWidth : null,
  })
);

/** @param {string} raw */
function redactUrl(raw) {
  if (!raw || typeof raw !== "string") return "<invalid-url>";
  try {
    const u = new URL(raw);
    const q = u.search ? "?<redacted>" : "";
    const h = u.hash ? "#<redacted>" : "";
    return `${u.protocol}//${u.host}${u.pathname}${q}${h}`;
  } catch {
    return "<unparseable-url>";
  }
}

/** @param {string[]} args */
function ffmpegArgsForLog(args) {
  return args.map((a) => (/^https?:\/\//i.test(a) ? redactUrl(a) : a));
}

async function pathExists(p) {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function logLocalIoDebug(phase, tmpPath, extra = {}) {
  const exists = await pathExists(tmpPath);
  let size = null;
  if (exists) {
    try {
      const st = await stat(tmpPath);
      size = st.size;
    } catch {
      size = "stat_failed";
    }
  }
  console.log(
    "[braw-proxy-worker] local_io",
    JSON.stringify({
      phase,
      output_temp_path: tmpPath,
      output_exists: exists,
      output_size_bytes: size,
      ...extra,
    })
  );
}

class FfmpegFailureError extends Error {
  /**
   * @param {string} message
   * @param {object} detail
   */
  constructor(message, detail) {
    super(message);
    this.name = "FfmpegFailureError";
    Object.assign(this, detail);
  }
}

/**
 * @param {string} urlString
 * @param {string} destPath
 */
async function downloadToFileFollow(urlString, destPath) {
  const maxHops = 10;
  let href = urlString;
  for (let i = 0; i < maxHops; i++) {
    const result = await new Promise((resolve, reject) => {
      const url = new URL(href);
      const lib = url.protocol === "https:" ? nodeHttps : http;
      const file = createWriteStream(destPath);
      const req = lib.get(href, { timeout: 3_600_000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          file.close();
          resolve({ redirect: new URL(res.headers.location, url).href });
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          file.close();
          reject(new Error(`download HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        finished(file).then(() => resolve({ ok: true })).catch(reject);
      });
      req.on("error", reject);
      req.setTimeout(3_600_000, () => req.destroy(new Error("download socket timeout")));
    });
    if ("redirect" in result && result.redirect) {
      href = result.redirect;
      continue;
    }
    return;
  }
  throw new Error("too many redirects");
}

async function postJson(path, body) {
  return postWorkerJson(base, path, secret, body);
}

async function putFile(url, filePath, headers) {
  const st = await stat(filePath);
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      ...headers,
      "Content-Length": String(st.size),
    },
    body: createReadStream(filePath),
    duplex: "half",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`PUT proxy failed ${res.status}: ${t.slice(0, 400)}`);
  }
}

/**
 * @param {string[]} args
 * @param {string} bin
 * @param {Record<string, unknown>} ctx
 */
function runCommand(bin, args, ctx) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    let stderr = "";
    let stdout = "";
    proc.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", (code, signal) => {
      if (code === 0) {
        resolve({ stderr, stdout });
        return;
      }
      const stderrTail = stderr.slice(-12_000);
      const excerpt =
        stderrTail.slice(-2000) || stdout.slice(-2000) || `(no stderr/stdout)`;
      const err = new FfmpegFailureError(
        `${basename(bin)} failed: exit=${code} signal=${signal ?? "null"} — ${excerpt.replace(/\s+/g, " ").trim().slice(0, 600)}`,
        {
          exitCode: code,
          exitSignal: signal,
          stderr,
          stdout,
          ...ctx,
        }
      );
      reject(err);
    });
    proc.on("error", reject);
  });
}

function inputSuffixFromJob(job) {
  const name = typeof job?.name === "string" ? job.name : "";
  const leaf = name.split(/[/\\]/).pop() || "";
  const lower = leaf.toLowerCase();
  if (lower.endsWith(".braw")) return ".braw";
  return ".braw";
}

function logDecodeFailure(err, payload) {
  const job = payload.job;
  const stderr = err.stderr || "";
  const stdout = err.stdout && String(err.stdout).trim() ? err.stdout : "";
  console.error(
    "[braw-proxy-worker] decode_failure",
    JSON.stringify({
      exit_code: err.exitCode,
      signal: err.exitSignal,
      job_id: job?.id,
      backup_file_id: job?.backup_file_id,
      source_redacted: payload.sourceDownloadUrl ? redactUrl(payload.sourceDownloadUrl) : null,
    })
  );
  console.error("[braw-proxy-worker] stderr\n", stderr);
  if (stdout) console.error("[braw-proxy-worker] stdout\n", stdout);
}

async function processJob(payload) {
  const job = payload.job;
  const claimIso = payload.claimed_at;
  if (!claimIso) throw new Error("claim response missing claimed_at");
  const hbMs = payload.heartbeat_interval_ms || 20000;
  const sourceUrl = payload.sourceDownloadUrl;
  const uploadUrl = payload.proxyUploadUrl;
  const uploadHeaders = payload.proxyUploadHeaders || {};
  const tmpPath = join(tmpdir(), `braw-proxy-out-${job.id}-${Date.now()}.mp4`);
  const inputPath = join(tmpdir(), `braw-proxy-in-${job.id}-${Date.now()}${inputSuffixFromJob(job)}`);
  const transcodeProfile = payload.transcode_profile ?? job.transcode_profile;
  const claimedBy = payload.worker_id ?? workerId;

  let iv = setInterval(() => {
    postJson("/api/workers/braw-proxy/heartbeat", {
      job_id: job.id,
      worker_id: workerId,
      claimed_at: claimIso,
      status: "transcoding",
      progress_pct: null,
    }).catch(() => {});
  }, hbMs);

  const ffCtx = {
    jobId: job.id,
    backupFileId: job.backup_file_id,
    claimedBy,
    claimedAt: claimIso,
    transcodeProfile,
    sourceRedacted: redactUrl(sourceUrl),
    outputTempPath: tmpPath,
  };

  try {
    await postJson("/api/workers/braw-proxy/heartbeat", {
      job_id: job.id,
      worker_id: workerId,
      claimed_at: claimIso,
      status: "downloading",
      progress_pct: 5,
    });

    await logLocalIoDebug("before_download", inputPath, {
      job_id: job.id,
      source_redacted: redactUrl(sourceUrl),
    });
    await downloadToFileFollow(sourceUrl, inputPath);
    const inSt = await stat(inputPath);
    console.log(
      "[braw-proxy-worker] downloaded",
      JSON.stringify({ job_id: job.id, input_bytes: inSt.size, input_path_suffix: inputSuffixFromJob(job) })
    );

    await logLocalIoDebug("before_transcode", tmpPath, { job_id: job.id });

    if (brawCliBin) {
      const args = [
        "--input",
        inputPath,
        "--output",
        tmpPath,
        "--width",
        String(brawProxyWidth),
        "--crf",
        "23",
        "--ffmpeg",
        encoderFfmpeg,
      ];
      console.log(
        "[braw-proxy-worker] cli_invoke",
        JSON.stringify({
          bin: brawCliBin,
          args: args.map((a) => (a.includes(inputPath) ? "<local-input>" : a === tmpPath ? "<local-output>" : a)),
          job_id: job.id,
        })
      );
      await runCommand(brawCliBin, args, ffCtx);
    } else {
      const args = [
        "-y",
        "-loglevel",
        "warning",
        "-probesize",
        "32M",
        "-analyzeduration",
        "10000000",
        "-i",
        inputPath,
        "-t",
        "3600",
        "-vf",
        "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
        "-c:v",
        "libx264",
        "-preset",
        preset,
        "-crf",
        "23",
        "-an",
        "-movflags",
        "+faststart",
        tmpPath,
      ];
      console.log(
        "[braw-proxy-worker] ffmpeg_invoke",
        JSON.stringify({
          bin: ffmpegBrawPath,
          args: ffmpegArgsForLog(args).map((a) => (a === inputPath ? "<local-input>" : a)),
          job_id: job.id,
          transcode_profile: transcodeProfile,
        })
      );
      await runCommand(ffmpegBrawPath, args, ffCtx);
    }

    await logLocalIoDebug("after_transcode_ok", tmpPath, { job_id: job.id });

    await postJson("/api/workers/braw-proxy/heartbeat", {
      job_id: job.id,
      worker_id: workerId,
      claimed_at: claimIso,
      status: "uploading",
      progress_pct: 90,
    });
    await putFile(uploadUrl, tmpPath, uploadHeaders);
    const st = await stat(tmpPath);
    await postJson("/api/workers/braw-proxy/complete", {
      job_id: job.id,
      worker_id: workerId,
      claimed_at: claimIso,
      ok: true,
      proxy_size_bytes: st.size,
    });
  } catch (e) {
    if (e instanceof FfmpegFailureError) {
      await logLocalIoDebug("after_transcode_fail", tmpPath, { job_id: job.id });
      logDecodeFailure(e, { ...payload, sourceDownloadUrl: sourceUrl });
    }
    const msg = e instanceof Error ? e.message : String(e);
    await postJson("/api/workers/braw-proxy/complete", {
      job_id: job.id,
      worker_id: workerId,
      claimed_at: claimIso,
      ok: false,
      error: msg,
    }).catch(() => {});
    throw e;
  } finally {
    clearInterval(iv);
    await unlink(inputPath).catch(() => {});
    await unlink(tmpPath).catch(() => {});
  }
}

async function loop() {
  for (;;) {
    try {
      const claim = await postJson("/api/workers/braw-proxy/claim", { worker_id: workerId });
      if (!claim.job) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      await processJob(claim);
    } catch (e) {
      if (!(e instanceof FfmpegFailureError)) {
        console.error("[braw-proxy-worker]", e);
      }
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
}

loop();
