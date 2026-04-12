/**
 * Lightweight structured logs per upload session (browser console JSON lines).
 * Opt-in production: NEXT_PUBLIC_UPLOAD_SESSION_TELEMETRY=1
 * Always on in development.
 */

export type UploadSessionTelemetrySurface = "upload_manager" | "uppy";
export type UploadSessionTelemetryMode = "single_put" | "multipart";

export interface UploadSessionTelemetryPayload {
  scope: "upload_session_telemetry";
  surface: UploadSessionTelemetrySurface;
  /** For comparing locked default vs conservative / aggressive (see multipart-thresholds). */
  multipartProfile: string;
  uploadMode: UploadSessionTelemetryMode;
  fileSizeBytes: number;
  partSizeBytes: number;
  concurrency: number;
  totalParts: number;
  /** ms from upload entry (UploadManager) or upload-start (Uppy) to first B2 PUT xhr.send */
  timeToFirstB2PutMs: number | null;
  totalDurationMs: number;
  /** App control plane (/api/uppy, /api/uploads). UploadManager: exact. Uppy: window since that file’s upload-start (batch overlap may share counts). */
  controlPlaneRequests: number;
  /** Part PUT retries (UploadManager). Uppy: AwsS3 upload-retry count. */
  retryCount: number;
  completionOk: boolean;
  finalizeOk: boolean;
  outcome: "success" | "failure" | "deduped" | "already_exists";
  error?: string;
}

export function isUploadSessionTelemetryEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV === "development") return true;
  return process.env.NEXT_PUBLIC_UPLOAD_SESSION_TELEMETRY === "1";
}

export function logUploadSessionTelemetry(payload: Omit<UploadSessionTelemetryPayload, "scope">): void {
  if (!isUploadSessionTelemetryEnabled()) return;
  try {
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        scope: "upload_session_telemetry" as const,
        ...payload,
      } satisfies UploadSessionTelemetryPayload)
    );
  } catch {
    // ignore
  }
}

/** Any request to app upload control-plane routes (same or NEXT_PUBLIC_UPLOAD_API_BASE_URL origin). */
export function isUploadControlPlaneFetchUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr, typeof window !== "undefined" ? window.location.href : "http://localhost/");
    return u.pathname.includes("/api/uppy") || u.pathname.includes("/api/uploads/");
  } catch {
    return false;
  }
}
