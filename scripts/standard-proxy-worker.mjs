#!/usr/bin/env node
/**
 * Long-running standard proxy worker (runs off Vercel): poll claim → ffmpeg → presigned PUT → complete.
 *
 * Env:
 *   BIZZI_API_BASE      — e.g. https://your-app.vercel.app (no trailing slash)
 *   MEDIA_STANDARD_WORKER_SECRET — same as Vercel
 *   WORKER_ID           — stable id per instance (default: hostname-pid)
 *   FFMPEG_PATH         — optional; default: ffmpeg-static
 *
 * Example:
 *   BIZZI_API_BASE=https://example.com MEDIA_STANDARD_WORKER_SECRET=xxx node scripts/standard-proxy-worker.mjs
 */
import { spawn } from "child_process";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import ffmpegStatic from "ffmpeg-static";

const base = (process.env.BIZZI_API_BASE || "").replace(/\/$/, "");
const secret = process.env.MEDIA_STANDARD_WORKER_SECRET || "";
const workerId = process.env.WORKER_ID || `${process.env.HOSTNAME || "worker"}-${process.pid}`;
const ffmpegBin = process.env.FFMPEG_PATH || ffmpegStatic;
const preset = process.env.PROXY_FFMPEG_PRESET || "veryfast";

if (!base || !secret) {
  console.error("Set BIZZI_API_BASE and MEDIA_STANDARD_WORKER_SECRET");
  process.exit(1);
}

if (!ffmpegBin) {
  console.error("ffmpeg binary not found (install ffmpeg-static or set FFMPEG_PATH)");
  process.exit(1);
}

async function postJson(path, body) {
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!r.ok) {
    throw new Error(`${path} ${r.status}: ${text.slice(0, 500)}`);
  }
  return data;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, FFREPORT: "file=/dev/null:level=0" },
    });
    let err = "";
    proc.stderr?.on("data", (d) => {
      err += d.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.slice(-4000) || `ffmpeg exit ${code}`));
    });
    proc.on("error", reject);
  });
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

async function processJob(payload) {
  const job = payload.job;
  const claimIso = payload.claimed_at;
  if (!claimIso) throw new Error("claim response missing claimed_at");
  const hbMs = payload.heartbeat_interval_ms || 20000;
  const sourceUrl = payload.sourceDownloadUrl;
  const uploadUrl = payload.proxyUploadUrl;
  const uploadHeaders = payload.proxyUploadHeaders || {};
  const tmpPath = join(tmpdir(), `proxy-worker-${job.id}-${Date.now()}.mp4`);

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

  try {
    await postJson("/api/workers/standard-proxy/heartbeat", {
      job_id: job.id,
      worker_id: workerId,
      claimed_at: claimIso,
      status: "downloading",
      progress_pct: 5,
    });
    await runFfmpeg(args);
    await postJson("/api/workers/standard-proxy/heartbeat", {
      job_id: job.id,
      worker_id: workerId,
      claimed_at: claimIso,
      status: "uploading",
      progress_pct: 90,
    });
    await putFile(uploadUrl, tmpPath, uploadHeaders);
    const st = await stat(tmpPath);
    await postJson("/api/workers/standard-proxy/complete", {
      job_id: job.id,
      worker_id: workerId,
      claimed_at: claimIso,
      ok: true,
      proxy_size_bytes: st.size,
    });
  } catch (e) {
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
      console.error("[standard-proxy-worker]", e);
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
}

loop();
