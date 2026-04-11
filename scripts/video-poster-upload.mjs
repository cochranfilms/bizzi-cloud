/**
 * Extract 480×270 poster JPEG from a local proxy MP4 and PUT to presigned URL (non-throwing wrapper).
 */
import { spawn } from "child_process";
import { stat } from "fs/promises";
import { unlink } from "fs/promises";
import {
  VIDEO_POSTER_FFMPEG_TIMEOUT_MS,
  videoPosterFrameFfmpegArgsFileInput,
} from "./video-poster-frame-worker.mjs";

/**
 * @param {string} ffmpegBin
 * @param {string} proxyMp4Path
 * @param {string} posterJpegPath
 * @param {number} seekSeconds
 */
function runPosterOnce(ffmpegBin, proxyMp4Path, posterJpegPath, seekSeconds) {
  return new Promise((resolve, reject) => {
    const args = videoPosterFrameFfmpegArgsFileInput(proxyMp4Path, seekSeconds, posterJpegPath);
    const proc = spawn(ffmpegBin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, FFREPORT: "file=/dev/null:level=0" },
    });
    let stderr = "";
    proc.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    const t = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      reject(new Error("poster ffmpeg timeout"));
    }, VIDEO_POSTER_FFMPEG_TIMEOUT_MS);
    proc.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) resolve();
      else reject(new Error(`poster ffmpeg exit ${code}: ${stderr.slice(-400)}`));
    });
    proc.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

/**
 * @param {string} ffmpegBin
 * @param {string} proxyMp4Path
 * @param {string} posterJpegPath
 */
export async function extractVideoPosterToFile(ffmpegBin, proxyMp4Path, posterJpegPath) {
  try {
    await runPosterOnce(ffmpegBin, proxyMp4Path, posterJpegPath, 0.5);
  } catch {
    await runPosterOnce(ffmpegBin, proxyMp4Path, posterJpegPath, 0);
  }
  const st = await stat(posterJpegPath);
  if (st.size < 32) throw new Error("poster output too small");
}

/**
 * @param {(url: string, path: string, headers: Record<string, string>) => Promise<void>} putFile
 * @param {string} ffmpegBin
 * @param {string} proxyMp4Path
 * @param {string | undefined} posterUploadUrl
 * @param {Record<string, string> | undefined} posterHeaders
 * @param {{ job_id?: string }} logCtx
 */
export async function tryUploadVideoPosterAfterProxy(
  putFile,
  ffmpegBin,
  proxyMp4Path,
  posterUploadUrl,
  posterHeaders,
  logCtx
) {
  if (!posterUploadUrl?.trim() || !ffmpegBin) return;
  const posterPath = `${proxyMp4Path}.poster.jpg`;
  try {
    await extractVideoPosterToFile(ffmpegBin, proxyMp4Path, posterPath);
    const sz = (await stat(posterPath)).size;
    await putFile(posterUploadUrl, posterPath, posterHeaders || {});
    console.log(
      "[video-poster] uploaded",
      JSON.stringify({ job_id: logCtx.job_id ?? null, bytes: sz })
    );
  } catch (e) {
    console.warn(
      "[video-poster] skipped_non_fatal",
      JSON.stringify({
        job_id: logCtx.job_id ?? null,
        message: e instanceof Error ? e.message.slice(0, 400) : String(e),
      })
    );
  } finally {
    await unlink(posterPath).catch(() => {});
  }
}
