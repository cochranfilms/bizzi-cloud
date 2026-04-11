#!/usr/bin/env node
/**
 * Large-video metadata worker: poll claim → ffprobe JSON on presigned URL → complete.
 * Runs on Ubuntu (or any host with ffprobe); keeps heavy probes off Vercel.
 *
 * Env (required):
 *   BIZZI_API_BASE — e.g. https://your-app.vercel.app (no trailing slash)
 *   MEDIA_STANDARD_WORKER_SECRET — same as Vercel (shared with standard proxy worker)
 *
 * Optional:
 *   WORKER_ID — stable id per instance (default: hostname-pid)
 *   FFPROBE_PATH — override binary; else PATH `ffprobe`, else ffprobe-static
 *   METADATA_FFPROBE_TIMEOUT_MS — probe wall clock (default: 600000)
 *
 * Example:
 *   BIZZI_API_BASE=https://example.com MEDIA_STANDARD_WORKER_SECRET=xxx node scripts/metadata-extraction-worker.mjs
 */
import { execFileSync, spawn } from "child_process";
import ffprobeStatic from "ffprobe-static";
import {
  idlePollMs,
  postWorkerClaimJson,
  postWorkerJson,
  transportBackoffMs,
} from "./media-worker-http.mjs";

const base = (process.env.BIZZI_API_BASE || "").replace(/\/$/, "");
const secret = process.env.MEDIA_STANDARD_WORKER_SECRET || "";
const workerId = process.env.WORKER_ID || `${process.env.HOSTNAME || "worker"}-${process.pid}`;
const probeTimeoutMs = Math.max(
  30_000,
  parseInt(String(process.env.METADATA_FFPROBE_TIMEOUT_MS || "600000"), 10) || 600_000
);

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

function resolveFfprobe() {
  const env = (process.env.FFPROBE_PATH || "").trim();
  if (env) return { path: env, via: "FFPROBE_PATH" };
  const pathBin = resolveOnPath("ffprobe");
  if (pathBin) return { path: pathBin, via: "PATH" };
  const p = ffprobeStatic?.path;
  if (p) return { path: p, via: "ffprobe-static" };
  return { path: null, via: "none" };
}

const ffprobeResolved = resolveFfprobe();
const ffprobeBin = ffprobeResolved.path;

if (!base || !secret) {
  console.error("Set BIZZI_API_BASE and MEDIA_STANDARD_WORKER_SECRET");
  process.exit(1);
}

if (!ffprobeBin) {
  console.error("ffprobe not found (set FFPROBE_PATH, install system ffprobe, or use ffprobe-static)");
  process.exit(1);
}

console.log(
  "[metadata-extraction-worker] startup",
  JSON.stringify({
    worker_id: workerId,
    ffprobe: { path: ffprobeBin, selected_via: ffprobeResolved.via },
    probe_timeout_ms: probeTimeoutMs,
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

/**
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<Record<string, unknown>>}
 */
function ffprobeJsonFromUrl(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      ffprobeBin,
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", url],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let out = "";
    let err = "";
    proc.stdout?.on("data", (d) => {
      out += d.toString();
    });
    proc.stderr?.on("data", (d) => {
      err += d.toString();
    });
    let settled = false;
    const killTimer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      if (!settled) {
        settled = true;
        reject(new Error(`ffprobe timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(killTimer);
      if (settled) return;
      settled = true;
      if (code !== 0) {
        reject(new Error(`ffprobe exit ${code}: ${err.replace(/\s+/g, " ").trim().slice(-800)}`));
        return;
      }
      try {
        const parsed = JSON.parse(out);
        if (!parsed || typeof parsed !== "object") {
          reject(new Error("ffprobe returned non-object JSON"));
          return;
        }
        resolve(parsed);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        reject(new Error(`ffprobe JSON parse failed: ${msg}`));
      }
    });
    proc.on("error", (e) => {
      clearTimeout(killTimer);
      if (!settled) {
        settled = true;
        reject(e);
      }
    });
  });
}

async function postComplete(body) {
  return postWorkerJson(base, "/api/workers/metadata-extraction/complete", secret, body, {
    timeoutMs: 120_000,
    retries: 6,
  });
}

async function processJob(payload) {
  const job = payload.job;
  const claimIso = payload.claimed_at;
  const sourceUrl = payload.sourceDownloadUrl;
  if (!job?.backup_file_id || !claimIso || !sourceUrl) {
    throw new Error("claim response missing job.backup_file_id, claimed_at, or sourceDownloadUrl");
  }

  console.log(
    "[metadata-extraction-worker] job_start",
    JSON.stringify({
      backup_file_id: job.backup_file_id,
      source_redacted: redactUrl(sourceUrl),
      claimed_at: claimIso,
    })
  );

  try {
    const fj = await ffprobeJsonFromUrl(sourceUrl, probeTimeoutMs);
    await postComplete({
      backup_file_id: job.backup_file_id,
      worker_id: workerId,
      claimed_at: claimIso,
      ok: true,
      ffprobe_json: fj,
    });
    console.log(
      "[metadata-extraction-worker] job_complete",
      JSON.stringify({ backup_file_id: job.backup_file_id, ok: true })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      "[metadata-extraction-worker] probe_failed",
      JSON.stringify({
        backup_file_id: job.backup_file_id,
        message: msg.slice(0, 500),
      })
    );
    await postComplete({
      backup_file_id: job.backup_file_id,
      worker_id: workerId,
      claimed_at: claimIso,
      ok: false,
      error: msg,
    }).catch(() => {});
  }
}

async function loop() {
  let transportStreak = 0;
  for (;;) {
    try {
      const claim = await postWorkerClaimJson(base, "/api/workers/metadata-extraction/claim", secret, {
        worker_id: workerId,
      });
      transportStreak = 0;
      if (!claim.job) {
        console.log("[metadata-extraction-worker] claim_idle", JSON.stringify({ worker_id: workerId }));
        await new Promise((r) => setTimeout(r, idlePollMs(5000, 2500)));
        continue;
      }
      await processJob(claim);
    } catch (e) {
      transportStreak += 1;
      const delay = transportBackoffMs(transportStreak - 1);
      console.error(
        "[metadata-extraction-worker] transport_error",
        JSON.stringify({
          worker_id: workerId,
          streak: transportStreak,
          delay_ms: delay,
          message: e instanceof Error ? e.message : String(e),
        })
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

loop();
