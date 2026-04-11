#!/usr/bin/env node
/**
 * Long-running standard proxy worker (runs off Vercel): poll claim → ffmpeg → presigned PUT → complete.
 *
 * Env:
 *   BIZZI_API_BASE      — e.g. https://your-app.vercel.app (no trailing slash)
 *   MEDIA_STANDARD_WORKER_SECRET — same as Vercel
 *   WORKER_ID           — stable id per instance (default: hostname-pid)
 *   FFMPEG_PATH         — optional; else PATH `ffmpeg`, else ffmpeg-static
 *   FFPROBE_PATH        — optional; else PATH `ffprobe`, else ffprobe-static (logged at startup; transcoding uses ffmpeg only)
 *
 * Example:
 *   BIZZI_API_BASE=https://example.com MEDIA_STANDARD_WORKER_SECRET=xxx node scripts/standard-proxy-worker.mjs
 */
import { execFileSync, spawn } from "child_process";
import { createReadStream } from "fs";
import { constants as fsConstants } from "fs";
import { stat, access } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { postWorkerJson } from "./media-worker-http.mjs";

const base = (process.env.BIZZI_API_BASE || "").replace(/\/$/, "");
const secret = process.env.MEDIA_STANDARD_WORKER_SECRET || "";
const workerId = process.env.WORKER_ID || `${process.env.HOSTNAME || "worker"}-${process.pid}`;
const preset = process.env.PROXY_FFMPEG_PRESET || "veryfast";

/** @param {string} bin */
function resolveOnPath(bin) {
  try {
    const out = execFileSync("sh", ["-c", `command -v ${bin} 2>/dev/null`], {
      encoding: "utf8",
      maxBuffer: 4096,
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function resolveFfmpeg() {
  const env = (process.env.FFMPEG_PATH || "").trim();
  if (env) return { path: env, via: "FFMPEG_PATH" };
  const pathBin = resolveOnPath("ffmpeg");
  if (pathBin) return { path: pathBin, via: "PATH" };
  if (ffmpegStatic) return { path: ffmpegStatic, via: "ffmpeg-static" };
  return { path: null, via: "none" };
}

function resolveFfprobe() {
  const env = (process.env.FFPROBE_PATH || "").trim();
  if (env) return { path: env, via: "FFPROBE_PATH" };
  const pathBin = resolveOnPath("ffprobe");
  if (pathBin) return { path: pathBin, via: "PATH" };
  const p = ffprobeStatic?.path;
  if (p) return { path: p, via: "ffprobe-static" };
  return { path: null, via: "none" };
}

const ffmpegResolved = resolveFfmpeg();
const ffprobeResolved = resolveFfprobe();
const ffmpegBin = ffmpegResolved.path;

if (!base || !secret) {
  console.error("Set BIZZI_API_BASE and MEDIA_STANDARD_WORKER_SECRET");
  process.exit(1);
}

if (!ffmpegBin) {
  console.error("ffmpeg binary not found (set FFMPEG_PATH, install system ffmpeg, or use ffmpeg-static)");
  process.exit(1);
}

console.log(
  "[standard-proxy-worker] binaries",
  JSON.stringify({
    ffmpeg: { path: ffmpegBin, selected_via: ffmpegResolved.via },
    ffprobe: ffprobeResolved.path
      ? { path: ffprobeResolved.path, selected_via: ffprobeResolved.via }
      : { path: null, selected_via: ffprobeResolved.via },
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

/** Local ffprobe duration (seconds) for complete payload — no server-side ffprobe on Vercel. */
function ffprobeDurationSeconds(filePath) {
  return new Promise((resolve) => {
    const bin = ffprobeResolved.path;
    if (!bin) {
      resolve(null);
      return;
    }
    const proc = spawn(
      bin,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let out = "";
    proc.stdout?.on("data", (d) => {
      out += d.toString();
    });
    const killTimer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      resolve(null);
    }, 120_000);
    proc.on("close", (code) => {
      clearTimeout(killTimer);
      if (code !== 0) {
        resolve(null);
        return;
      }
      const n = parseFloat(out.trim());
      resolve(Number.isFinite(n) ? n : null);
    });
    proc.on("error", () => {
      clearTimeout(killTimer);
      resolve(null);
    });
  });
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
    "[standard-proxy-worker] local_io",
    JSON.stringify({
      phase,
      output_temp_path: tmpPath,
      output_exists: exists,
      output_size_bytes: size,
      input_local_path: null,
      note: "input is remote URL (presigned GET); no local input file",
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
 * @param {string[]} args
 * @param {Record<string, unknown>} ctx
 */
function runFfmpeg(args, ctx) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin, args, {
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
        `ffmpeg failed: exit=${code} signal=${signal ?? "null"} — ${excerpt.replace(/\s+/g, " ").trim().slice(0, 600)}`,
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

function logFfmpegFailure(err, payload) {
  const job = payload.job;
  const claimIso = payload.claimed_at;
  const claimedBy = payload.worker_id ?? workerId;
  const profile = payload.transcode_profile ?? job?.transcode_profile;
  const sourceUrl = payload.sourceDownloadUrl;
  const tmpPath = err.outputTempPath;
  const stderr = err.stderr || "";
  const stdout = err.stdout && String(err.stdout).trim() ? err.stdout : "";

  console.error(
    "[standard-proxy-worker] ffmpeg_failure",
    JSON.stringify({
      exit_code: err.exitCode,
      signal: err.exitSignal,
      job_id: job?.id,
      backup_file_id: job?.backup_file_id,
      claimed_by: claimedBy,
      claimed_at: claimIso,
      transcode_profile: profile,
      source_redacted: sourceUrl ? redactUrl(sourceUrl) : null,
      output_temp_path: tmpPath,
      stderr_bytes: stderr.length,
      stdout_bytes: stdout.length,
    })
  );
  console.error("[standard-proxy-worker] ffmpeg_stderr_full\n", stderr);
  if (stdout) console.error("[standard-proxy-worker] ffmpeg_stdout_full\n", stdout);
}

async function processJob(payload) {
  const job = payload.job;
  const claimIso = payload.claimed_at;
  if (!claimIso) throw new Error("claim response missing claimed_at");
  const hbMs = payload.heartbeat_interval_ms || 20000;
  const sourceUrl = payload.sourceDownloadUrl;
  const uploadUrl = payload.proxyUploadUrl;
  const uploadHeaders = payload.proxyUploadHeaders || {};
  const tmpPath = join(tmpdir(), `proxy-worker-${job.id}-${Date.now()}.mp4`);
  const transcodeProfile = payload.transcode_profile ?? job.transcode_profile;
  const claimedBy = payload.worker_id ?? workerId;

  let iv = setInterval(() => {
    postJson("/api/workers/standard-proxy/heartbeat", {
      job_id: job.id,
      worker_id: workerId,
      claimed_at: claimIso,
      status: "transcoding",
      progress_pct: null,
    }).catch(() => {});
  }, hbMs);

  const args = [
    "-y",
    "-loglevel",
    "warning",
    "-probesize",
    "32K",
    "-analyzeduration",
    "500000",
    "-i",
    sourceUrl,
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
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-movflags",
    "+faststart",
    tmpPath,
  ];

  console.log(
    "[standard-proxy-worker] ffmpeg_invoke",
    JSON.stringify({
      bin: ffmpegBin,
      args: ffmpegArgsForLog(args),
      job_id: job.id,
      backup_file_id: job.backup_file_id,
      claimed_by: claimedBy,
      claimed_at: claimIso,
      transcode_profile: transcodeProfile,
    })
  );

  try {
    await postJson("/api/workers/standard-proxy/heartbeat", {
      job_id: job.id,
      worker_id: workerId,
      claimed_at: claimIso,
      status: "downloading",
      progress_pct: 5,
    });

    await logLocalIoDebug("before_ffmpeg", tmpPath, {
      job_id: job.id,
      source_redacted: redactUrl(sourceUrl),
    });

    const ffCtx = {
      jobId: job.id,
      backupFileId: job.backup_file_id,
      claimedBy,
      claimedAt: claimIso,
      transcodeProfile,
      sourceRedacted: redactUrl(sourceUrl),
      outputTempPath: tmpPath,
    };

    await runFfmpeg(args, ffCtx);

    await logLocalIoDebug("after_ffmpeg_ok", tmpPath, { job_id: job.id });

    await postJson("/api/workers/standard-proxy/heartbeat", {
      job_id: job.id,
      worker_id: workerId,
      claimed_at: claimIso,
      status: "uploading",
      progress_pct: 90,
    });
    await putFile(uploadUrl, tmpPath, uploadHeaders);
    const st = await stat(tmpPath);
    const proxyDurationSec = await ffprobeDurationSeconds(tmpPath);
    await postJson("/api/workers/standard-proxy/complete", {
      job_id: job.id,
      worker_id: workerId,
      claimed_at: claimIso,
      ok: true,
      proxy_size_bytes: st.size,
      proxy_duration_sec: proxyDurationSec,
    });
  } catch (e) {
    if (e instanceof FfmpegFailureError) {
      await logLocalIoDebug("after_ffmpeg_fail", tmpPath, {
        job_id: job.id,
        source_redacted: redactUrl(sourceUrl),
      });
      logFfmpegFailure(e, { ...payload, transcode_profile: transcodeProfile });
    }
    const msg = e instanceof Error ? e.message : String(e);
    await postJson("/api/workers/standard-proxy/complete", {
      job_id: job.id,
      worker_id: workerId,
      claimed_at: claimIso,
      ok: false,
      error: msg,
    }).catch(() => {});
    throw e;
  } finally {
    clearInterval(iv);
    await import("fs/promises").then((fs) => fs.unlink(tmpPath).catch(() => {}));
  }
}

async function loop() {
  for (;;) {
    try {
      const claim = await postJson("/api/workers/standard-proxy/claim", { worker_id: workerId });
      if (!claim.job) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      await processJob(claim);
    } catch (e) {
      if (!(e instanceof FfmpegFailureError)) {
        console.error("[standard-proxy-worker]", e);
      }
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
}

loop();
