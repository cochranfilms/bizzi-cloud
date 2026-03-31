/**
 * Creator RAW upload client hints (filename only). Server: `upload-finalize-guards` + ffprobe.
 * Filename: `creator-raw-upload-policy.ts` (lowercase `.ts` — required for portable tooling).
 */

import { getProxyCapability } from "@/lib/format-detection";
import { CREATOR_RAW_MEDIA_POLICY } from "@/lib/creator-raw-media-config";

const NON_MEDIA_LEAVES = new Set<string>(CREATOR_RAW_MEDIA_POLICY.nonCreatorRawLeafExtensions);

function leafExt(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const i = base.lastIndexOf(".");
  if (i < 0) return "";
  return base.slice(i + 1).toLowerCase();
}

/**
 * Client-only: skip obvious documents/archives on Creator RAW. Do not use for codec allow —
 * `.mp4` / `.mov` must reach the server so ffprobe can run.
 */
export function creatorRawClientAllowsUploadAttempt(fileName: string): boolean {
  const ext = leafExt(fileName);
  if (!ext) return true;
  return !NON_MEDIA_LEAVES.has(ext);
}

export type CreatorRawBucket = "fully_supported" | "conditional_raw" | "blocked";

export type CreatorRawClassification = {
  bucket: CreatorRawBucket;
  /** Stable code for logs */
  code: string;
  userMessage: string;
};

const STORAGE_HINT =
  "Creator RAW accepts formats Bizzi can preview and grade with LUTs. Upload this file to Storage instead.";

/** Server: require BRAW-capable FFmpeg for .braw in Creator RAW. */
function brawPipelineEnabledServerReal(): boolean {
  return typeof process !== "undefined" && Boolean(process.env.FFMPEG_BRAW_PATH);
}

/**
 * Classify upload for Creator RAW. `serverSide` enables env-based gates (e.g. BRAW).
 */
export function classifyCreatorRawUpload(
  fileName: string,
  options?: { serverSide?: boolean; contentType?: string | null }
): CreatorRawClassification {
  const serverSide = options?.serverSide === true;
  const cap = getProxyCapability(fileName, null);

  if (cap === "direct") {
    return {
      bucket: "fully_supported",
      code: "direct_proxy",
      userMessage: "",
    };
  }

  if (cap === "raw_try") {
    const ext = (fileName.split(".").pop() ?? "").toLowerCase();
    if (ext === "braw") {
      const ok = serverSide ? brawPipelineEnabledServerReal() : true;
      if (!ok) {
        return {
          bucket: "blocked",
          code: "braw_no_pipeline",
          userMessage: STORAGE_HINT,
        };
      }
      return {
        bucket: "conditional_raw",
        code: "braw",
        userMessage: "",
      };
    }
    if (serverSide) {
      return {
        bucket: "blocked",
        code: "raw_try_unsupported_env",
        userMessage: STORAGE_HINT,
      };
    }
    return {
      bucket: "conditional_raw",
      code: "raw_try_client",
      userMessage: "",
    };
  }

  return {
    bucket: "blocked",
    code: "unsupported_format",
    userMessage: STORAGE_HINT,
  };
}

export function isAllowedInCreatorRaw(
  fileName: string,
  options?: { serverSide?: boolean; contentType?: string | null }
): boolean {
  const c = classifyCreatorRawUpload(fileName, options);
  return c.bucket !== "blocked";
}

/** Server finalize: strict gate including BRAW env. */
export function creatorRawFinalizeAllowsFileName(fileName: string): boolean {
  return isAllowedInCreatorRaw(fileName, { serverSide: true });
}

export function leafNameFromRelativePath(relativePath: string): string {
  const safe = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");
  const parts = safe.split("/");
  return parts[parts.length - 1] || safe;
}
