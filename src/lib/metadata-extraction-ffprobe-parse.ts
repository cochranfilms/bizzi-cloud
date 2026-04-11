/**
 * Map ffprobe -print_format json output to backup_files fields * (parity with parseFfmpegOutput in extract-metadata route).
 */
import path from "path";

function getExtension(name: string): string {
  return path.extname(name).toLowerCase().slice(1) || "";
}

function parseFrameRate(rate: string | undefined): number | null {
  if (!rate || rate === "0/0") return null;
  const parts = rate.split("/");
  if (parts.length === 2) {
    const n = Number(parts[0]);
    const d = Number(parts[1]);
    if (d > 0 && Number.isFinite(n)) return n / d;
  }
  const f = parseFloat(rate);
  return Number.isFinite(f) ? f : null;
}

/**
 * @param root - parsed ffprobe JSON root object
 * @param fileName - leaf file name for container_format / content_type hints
 */
export function ffprobeJsonToBackupUpdates(
  root: Record<string, unknown>,
  fileName: string
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  const streams = root.streams as Array<Record<string, unknown>> | undefined;
  const format = root.format as Record<string, unknown> | undefined;

  const videoStream = streams?.find((s) => String(s.codec_type) === "video");
  const hasVideo = Boolean(videoStream);
  const hasAudio = Boolean(streams?.some((s) => String(s.codec_type) === "audio"));

  if (hasVideo) {
    updates.media_type = "video";
    const ext = getExtension(fileName) || "mp4";
    updates.container_format = ext || "mp4";
    updates.content_type = ["mov", "m4v"].includes(ext) ? "video/quicktime" : "video/mp4";
  }

  if (format?.duration != null) {
    const d = parseFloat(String(format.duration));
    if (Number.isFinite(d) && d > 0) updates.duration_sec = d;
  }

  if (videoStream) {
    const w = videoStream.width;
    const h = videoStream.height;
    if (typeof w === "number" && Number.isFinite(w)) updates.resolution_w = w;
    if (typeof h === "number" && Number.isFinite(h)) updates.resolution_h = h;
    const fr =
      parseFrameRate(String(videoStream.r_frame_rate ?? "")) ??
      parseFrameRate(String(videoStream.avg_frame_rate ?? ""));
    if (fr != null && fr > 0) updates.frame_rate = fr;
    const codec = String(videoStream.codec_name ?? "").toLowerCase();
    if (codec) updates.video_codec = codec;
  }

  updates.has_audio = hasAudio;
  const audioStream = streams?.find((s) => String(s.codec_type) === "audio");
  if (audioStream && audioStream.channels != null) {
    const ch = Number(audioStream.channels);
    if (Number.isFinite(ch) && ch > 0) updates.audio_channels = ch;
  }

  const tags = format?.tags as Record<string, unknown> | undefined;
  const creation =
    tags?.creation_time != null
      ? String(tags.creation_time)
      : tags?.["com.apple.quicktime.creationdate"] != null
        ? String(tags["com.apple.quicktime.creationdate"])
        : null;
  if (creation) {
    const parsed = Date.parse(creation.replace(/Z?$/, "Z"));
    if (!Number.isNaN(parsed)) updates.created_at = new Date(parsed).toISOString();
  }

  return updates;
}
