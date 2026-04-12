import { MULTIPART_THRESHOLD_BYTES } from "@/lib/multipart-thresholds";

/**
 * When to use S3 multipart instead of a single presigned PUT (Uppy AwsS3).
 *
 * Backblaze B2 occasionally returns HTTP 500 on presigned PutObject for small objects
 * under macOS package paths — notably AppleDouble (`._*`) and Final Cut temp leaves
 * (`.___*`) inside `.fcpbundle`. Multipart UploadPart sidesteps that path while staying
 * SSE-B2 via CreateMultipartUpload. Zero-byte placeholders use one multipart part so
 * they complete through `/multipart/.../complete` (presigned-complete only runs for
 * small non-multipart uploads with a non-zero size).
 */
export function shouldUseUppyS3Multipart(file: {
  size?: number | null;
  meta?: Record<string, unknown>;
}): boolean {
  const s = file.size ?? 0;
  if (s > MULTIPART_THRESHOLD_BYTES) return true;
  if (s === 0) return true;

  const meta = file.meta ?? {};
  const rp = String(meta.relativePath ?? meta.relative_path ?? meta.name ?? "").replace(/^\/+/, "");
  const leaf = rp.split("/").filter(Boolean).pop() ?? "";
  if (leaf.startsWith("._")) return true;
  if (leaf.startsWith(".___")) return true;
  return false;
}
