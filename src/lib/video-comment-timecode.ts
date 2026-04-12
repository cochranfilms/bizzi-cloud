/** Timecode for immersive file comments: HH:MM:SS.mmm (Shade-style live + stored). */

export function formatVideoCommentTimecodeWithMs(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00:00.000";
  const totalMs = Math.min(Number.MAX_SAFE_INTEGER, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}
