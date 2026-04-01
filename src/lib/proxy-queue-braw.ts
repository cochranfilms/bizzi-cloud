/**
 * Whether a proxy_jobs row must be processed by the BRAW Linux worker, not standard FFmpeg.
 */
import type { ProxyJobMediaWorker } from "@/lib/braw-media-worker";
import { isBrawFile } from "@/lib/format-detection";

export function proxyJobRowIsBrawQueue(
  data: Record<string, unknown> | undefined,
  object_key: string,
  name: string | null
): boolean {
  if (!data) return false;
  if (data.media_worker === "braw") return true;
  const leaf = name ?? object_key;
  if (isBrawFile(leaf) && data.media_worker !== "standard") return true;
  return false;
}
