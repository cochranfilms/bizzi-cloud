/**
 * Upload manager: direct-to-B2 multipart uploads with resumability, dedupe, and adaptive concurrency.
 * File bytes never pass through Vercel; client uploads directly to Backblaze B2.
 * Control-plane calls use `getUploadApiBaseUrl()` (NEXT_PUBLIC_UPLOAD_API_BASE_URL) when set.
 */

import type { UploadCreateResponse, FileFingerprint } from "@/types/upload";
import { getUploadApiBaseUrl } from "@/lib/upload-api-base";
import { getUploadMultipartProfileLabel, MULTIPART_THRESHOLD_BYTES } from "@/lib/multipart-thresholds";
import {
  logUploadSessionTelemetry,
  type UploadSessionTelemetryMode,
} from "@/lib/upload-session-telemetry";

const SAMPLE_SIZE = 64 * 1024;

export async function computeFastFingerprint(file: File): Promise<string> {
  const parts: string[] = [
    String(file.size),
    file.name.toLowerCase().replace(/\s+/g, "_"),
    String(file.lastModified),
  ];
  const samples: Uint8Array[] = [];
  if (file.size > 0) {
    const first = file.slice(0, Math.min(SAMPLE_SIZE, file.size));
    samples.push(new Uint8Array(await first.arrayBuffer()));
    if (file.size > SAMPLE_SIZE * 2) {
      const mid = Math.floor(file.size / 2) - SAMPLE_SIZE / 2;
      const middle = file.slice(mid, mid + SAMPLE_SIZE);
      samples.push(new Uint8Array(await middle.arrayBuffer()));
    }
    if (file.size > SAMPLE_SIZE) {
      const lastStart = Math.max(0, file.size - SAMPLE_SIZE);
      const last = file.slice(lastStart, file.size);
      samples.push(new Uint8Array(await last.arrayBuffer()));
    }
  }
  const combined = new Uint8Array(samples.reduce((s, a) => s + a.length, 0));
  let offset = 0;
  for (const s of samples) {
    combined.set(s, offset);
    offset += s.length;
  }
  const hashBuffer = await crypto.subtle.digest("SHA-256", combined);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const sampledHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  parts.push(sampledHash);
  const payload = parts.join("|");
  const finalHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(finalHash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function fingerprintToPayload(fp: FileFingerprint): string {
  return [String(fp.size), fp.name, String(fp.lastModified), fp.sampledHash].join("|");
}

export interface UploadManagerOptions {
  getIdToken: () => Promise<string | null>;
  getUserId?: () => string | null;
  getBaseUrl?: () => string;
  onProgress?: (ev: UploadProgressEvent) => void;
  /** Awaited before upload() resolves; keep limited to storage commit + backup registration (+ selection callbacks). */
  onComplete?: (ev: { fileId: string; objectKey: string }) => void | Promise<void>;
  onError?: (ev: { fileId: string; error: string }) => void;
}

export interface UploadProgressEvent {
  fileId: string;
  fileName: string;
  bytesLoaded: number;
  bytesTotal: number;
  partsCompleted: number;
  partsTotal: number;
  speedBytesPerSec: number;
  etaSeconds: number | null;
  status: "pending" | "uploading" | "completed" | "cancelled" | "error";
}

export interface QueuedFile {
  id: string;
  file: File;
  driveId: string;
  relativePath: string;
  workspaceId?: string;
  organizationId?: string | null;
}

const STORAGE_KEY = "bizzi_upload_sessions";

function loadSessions(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function saveSession(fileId: string, data: unknown) {
  if (typeof window === "undefined") return;
  try {
    const all = loadSessions();
    all[fileId] = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

function removeSession(fileId: string) {
  if (typeof window === "undefined") return;
  try {
    const all = loadSessions();
    delete all[fileId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

function putWithProgress(
  blob: Blob,
  url: string,
  contentType: string,
  opts: {
    signal?: AbortSignal;
    onProgress?: (loaded: number, total: number) => void;
    /** Set true for single-file presigned PUT (required for B2 SSE-B2). False for multipart parts. */
    sseRequired?: boolean;
    /** Fires synchronously immediately before the first body byte is sent (first B2 PUT). */
    onBeforeSend?: () => void;
  }
): Promise<{ etag: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    if (opts.sseRequired) xhr.setRequestHeader("x-amz-server-side-encryption", "AES256");
    if (opts.signal) opts.signal.addEventListener("abort", () => xhr.abort());
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && opts.onProgress) opts.onProgress(e.loaded, e.total);
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("etag") ?? xhr.getResponseHeader("ETag");
        if (!etag) return reject(new Error("Missing ETag"));
        resolve({ etag: etag.replace(/^"|"$/g, "") });
      } else reject(new Error(`Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.onabort = () => reject(new Error("Upload aborted"));
    opts.onBeforeSend?.();
    xhr.send(blob);
  });
}

async function putPartWithRetry(
  blob: Blob,
  url: string,
  contentType: string,
  opts: {
    signal?: AbortSignal;
    onProgress?: (loaded: number, total: number) => void;
    onBeforeSend?: () => void;
  },
  maxRetries = 6
): Promise<{ etag: string; attempts: number }> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { etag } = await putWithProgress(blob, url, contentType, {
        signal: opts.signal,
        onProgress: opts.onProgress,
        onBeforeSend: attempt === 0 ? opts.onBeforeSend : undefined,
      });
      return { etag, attempts: attempt + 1 };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (lastErr.message === "Upload aborted") throw lastErr;
      if (attempt < maxRetries - 1) {
        const baseDelay = Math.min(2000 * 2 ** attempt, 20000);
        const jitter = Math.random() * 2000;
        await new Promise((r) => setTimeout(r, baseDelay + jitter));
      }
    }
  }
  throw lastErr ?? new Error("Upload failed");
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

/** Above this size, skip content hash (use fingerprint only) to avoid blocking upload start. */
const CONTENT_HASH_SKIP_THRESHOLD = 20 * 1024 * 1024 * 1024;

/** When totalParts exceeds this, fetch part URLs lazily instead of up front. */
const LAZY_FETCH_THRESHOLD = 400;

/** Batch size for lazy part URL fetches. */
const LAZY_BATCH_SIZE = 400;

export class UploadManager {
  private opts: UploadManagerOptions;
  private aborts = new Map<string, AbortController>();
  private progress = new Map<string, { loaded: number; lastTime: number; lastLoaded: number }>();

  constructor(opts: UploadManagerOptions) {
    this.opts = opts;
  }

  private getBaseUrl(): string {
    return this.opts.getBaseUrl?.() ?? getUploadApiBaseUrl();
  }

  private async apiFetch(path: string, init: Omit<RequestInit, "body"> & { body?: Record<string, unknown> }) {
    const token = await this.opts.getIdToken();
    if (!token) throw new Error("Not authenticated");
    const { body: bodyObj, ...rest } = init;
    const body = bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined;
    const res = await fetch(`${this.getBaseUrl()}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(rest.headers as Record<string, string>),
      },
      body,
    });
    return res;
  }

  cancel(fileId: string) {
    const ac = this.aborts.get(fileId);
    if (ac) ac.abort();
  }

  private createLazyPartUrlFetcher(
    sessionId: string,
    objectKey: string,
    uploadId: string,
    totalParts: number,
    initialParts: { partNumber: number; uploadUrl: string }[],
    signal: AbortSignal,
    doApiFetch: (
      path: string,
      init: Omit<RequestInit, "body"> & { body?: Record<string, unknown> }
    ) => Promise<Response>
  ): (partNumber: number) => Promise<string> {
    const cache = new Map<number, string>();
    for (const p of initialParts) cache.set(p.partNumber, p.uploadUrl);
    const fetchInProgress = new Map<number, Promise<void>>();

    return async (partNumber: number): Promise<string> => {
      const cached = cache.get(partNumber);
      if (cached) return cached;

      const batchIndex = Math.floor((partNumber - 1) / LAZY_BATCH_SIZE);
      const batchStart = batchIndex * LAZY_BATCH_SIZE + 1;
      let batchPromise = fetchInProgress.get(batchStart);

      if (!batchPromise) {
        batchPromise = (async () => {
          const partNumbers = Array.from(
            { length: LAZY_BATCH_SIZE },
            (_, i) => batchStart + i
          ).filter((n) => n >= 1 && n <= totalParts);
          const batchRes = await doApiFetch("/api/uploads/parts/batch", {
            method: "POST",
            body: {
              session_id: sessionId,
              object_key: objectKey,
              upload_id: uploadId,
              part_numbers: partNumbers,
              user_id: this.opts.getUserId?.() ?? undefined,
            },
          });
          if (signal?.aborted) return;
          if (!batchRes.ok) throw new Error("Failed to get part URLs");
          const batch = (await batchRes.json()) as { parts: { partNumber: number; uploadUrl: string }[] };
          for (const p of batch.parts) cache.set(p.partNumber, p.uploadUrl);
          fetchInProgress.delete(batchStart);
        })();
        fetchInProgress.set(batchStart, batchPromise);
      }

      await batchPromise;
      const url = cache.get(partNumber);
      if (!url) throw new Error(`Part ${partNumber} URL not found`);
      return url;
    };
  }

  private reportProgress(
    fileId: string,
    fileName: string,
    bytesLoaded: number,
    bytesTotal: number,
    partsCompleted: number,
    partsTotal: number,
    status: UploadProgressEvent["status"]
  ) {
    const now = Date.now();
    const prev = this.progress.get(fileId);
    let speedBytesPerSec = 0;
    let etaSeconds: number | null = null;
    if (prev && now > prev.lastTime) {
      const dt = (now - prev.lastTime) / 1000;
      const dLoaded = bytesLoaded - prev.lastLoaded;
      if (dt > 0 && dLoaded >= 0) speedBytesPerSec = dLoaded / dt;
      if (speedBytesPerSec > 0 && bytesLoaded < bytesTotal) {
        etaSeconds = Math.ceil((bytesTotal - bytesLoaded) / speedBytesPerSec);
      }
    }
    this.progress.set(fileId, { loaded: bytesLoaded, lastTime: now, lastLoaded: bytesLoaded });
    this.opts.onProgress?.({
      fileId,
      fileName,
      bytesLoaded,
      bytesTotal,
      partsCompleted,
      partsTotal,
      speedBytesPerSec,
      etaSeconds,
      status,
    });
  }

  private async invokeOnComplete(ev: { fileId: string; objectKey: string }): Promise<void> {
    await Promise.resolve(this.opts.onComplete?.(ev));
  }

  async upload(queued: QueuedFile): Promise<{ objectKey: string }> {
    const { id: fileId, file, driveId, relativePath, workspaceId, organizationId } = queued;
    const controller = new AbortController();
    this.aborts.set(fileId, controller);
    this.progress.set(fileId, { loaded: 0, lastTime: Date.now(), lastLoaded: 0 });

    const contentType = file.type || "application/octet-stream";

    const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    const t0 = nowMs();
    let firstB2PutMs: number | null = null;
    const markFirstB2 = () => {
      if (firstB2PutMs == null) firstB2PutMs = nowMs() - t0;
    };
    let controlPlaneRequests = 0;
    let partRetrySum = 0;
    type ApiInit = Omit<RequestInit, "body"> & { body?: Record<string, unknown> };
    const cpFetch = (path: string, init: ApiInit) => {
      controlPlaneRequests++;
      return this.apiFetch(path, init);
    };

    const multipartProfile = getUploadMultipartProfileLabel();
    const emitSession = (p: {
      uploadMode: UploadSessionTelemetryMode;
      fileSizeBytes: number;
      partSizeBytes: number;
      concurrency: number;
      totalParts: number;
      completionOk: boolean;
      finalizeOk: boolean;
      outcome: "success" | "failure" | "deduped" | "already_exists";
      error?: string;
    }) => {
      logUploadSessionTelemetry({
        surface: "upload_manager",
        multipartProfile,
        timeToFirstB2PutMs: firstB2PutMs,
        totalDurationMs: nowMs() - t0,
        controlPlaneRequests,
        retryCount: partRetrySum,
        ...p,
      });
    };

    try {
      const fingerprint = await computeFastFingerprint(file);
      const dedupeRes = await cpFetch("/api/uploads/dedupe/check", {
        method: "POST",
        body: {
          fingerprint,
          content_hash: null,
          workspace_id: workspaceId ?? null,
          user_id: this.opts.getUserId?.() ?? undefined,
        } as Record<string, unknown>,
      });
      if (dedupeRes.ok) {
        const dedupe = (await dedupeRes.json()) as { exists?: boolean; objectKey?: string };
        if (dedupe.exists && dedupe.objectKey) {
          this.reportProgress(fileId, file.name, file.size, file.size, 1, 1, "completed");
          let finalizeOk = true;
          try {
            await this.invokeOnComplete({ fileId, objectKey: dedupe.objectKey });
          } catch {
            finalizeOk = false;
          }
          emitSession({
            uploadMode: "single_put",
            fileSizeBytes: file.size,
            partSizeBytes: 0,
            concurrency: 0,
            totalParts: 0,
            completionOk: true,
            finalizeOk,
            outcome: "deduped",
          });
          return { objectKey: dedupe.objectKey };
        }
      }

      if (file.size < MULTIPART_THRESHOLD_BYTES) {
        const urlRes = await cpFetch("/api/uploads/start-upload", {
          method: "POST",
          body: {
            drive_id: driveId,
            relative_path: relativePath,
            content_type: contentType,
            content_hash: null,
            user_id: this.opts.getUserId?.() ?? undefined,
            size_bytes: file.size,
            file_name: file.name,
            last_modified: file.lastModified,
            workspace_id: workspaceId ?? null,
            source: "web",
            preferred_upload_mode: "single_put",
          },
        });
        if (!urlRes.ok) {
          const data = await urlRes.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? "Failed to get upload URL");
        }
        const urlData = (await urlRes.json()) as {
          uploadUrl?: string;
          putUrl?: string;
          objectKey: string;
          alreadyExists?: boolean;
        };
        if (urlData.alreadyExists) {
          this.reportProgress(fileId, file.name, file.size, file.size, 1, 1, "completed");
          let finalizeOk = true;
          try {
            await this.invokeOnComplete({ fileId, objectKey: urlData.objectKey });
          } catch {
            finalizeOk = false;
          }
          emitSession({
            uploadMode: "single_put",
            fileSizeBytes: file.size,
            partSizeBytes: 0,
            concurrency: 1,
            totalParts: 1,
            completionOk: true,
            finalizeOk,
            outcome: "already_exists",
          });
          return { objectKey: urlData.objectKey };
        }
        const putTarget = urlData.uploadUrl ?? urlData.putUrl;
        if (!putTarget) throw new Error("No upload URL");
        await putWithProgress(file, putTarget, contentType, {
          signal: controller.signal,
          sseRequired: true,
          onBeforeSend: markFirstB2,
          onProgress: (loaded) =>
            this.reportProgress(fileId, file.name, loaded, file.size, loaded >= file.size ? 1 : 0, 1, "uploading"),
        });
        this.reportProgress(fileId, file.name, file.size, file.size, 1, 1, "completed");
        let finalizeOkSp = true;
        try {
          await this.invokeOnComplete({ fileId, objectKey: urlData.objectKey });
        } catch {
          finalizeOkSp = false;
        }
        emitSession({
          uploadMode: "single_put",
          fileSizeBytes: file.size,
          partSizeBytes: 0,
          concurrency: 1,
          totalParts: 1,
          completionOk: true,
          finalizeOk: finalizeOkSp,
          outcome: "success",
        });
        return { objectKey: urlData.objectKey };
      }

      const contentHash =
        file.size > CONTENT_HASH_SKIP_THRESHOLD ? null : await this.sha256Hex(file);
      const createRes = await cpFetch("/api/uploads/start-upload", {
        method: "POST",
        body: {
          drive_id: driveId,
          relative_path: relativePath,
          content_type: contentType,
          content_hash: contentHash,
          file_fingerprint: fingerprint,
          size_bytes: file.size,
          file_name: file.name,
          last_modified: file.lastModified,
          workspace_id: workspaceId ?? null,
          source: "web",
          preferred_upload_mode: "auto",
          user_id: this.opts.getUserId?.() ?? undefined,
        },
      });
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to create upload session");
      }
      const create = (await createRes.json()) as UploadCreateResponse;
      if (create.alreadyExists && create.existingObjectKey) {
        this.reportProgress(fileId, file.name, file.size, file.size, 1, 1, "completed");
        let finalizeOkEx = true;
        try {
          await this.invokeOnComplete({ fileId, objectKey: create.existingObjectKey });
        } catch {
          finalizeOkEx = false;
        }
        emitSession({
          uploadMode: "multipart",
          fileSizeBytes: file.size,
          partSizeBytes: 0,
          concurrency: 0,
          totalParts: 0,
          completionOk: true,
          finalizeOk: finalizeOkEx,
          outcome: "already_exists",
        });
        return { objectKey: create.existingObjectKey };
      }
      if (
        !create.uploadId ||
        !create.sessionId ||
        create.totalParts == null ||
        create.totalParts < 1
      ) {
        throw new Error("Invalid create response");
      }

      let parts = (create.parts ?? []) as { partNumber: number; uploadUrl: string }[];
      const { objectKey, uploadId, recommendedPartSize, recommendedConcurrency, totalParts } = create;

      const useLazyFetch = totalParts > LAZY_FETCH_THRESHOLD || parts.length === 0;

      if (!useLazyFetch && parts.length < totalParts) {
        const batchSize = 200;
        for (let start = parts.length; start < totalParts; start += batchSize) {
          const partNumbers = Array.from(
            { length: Math.min(batchSize, totalParts - start) },
            (_, i) => start + i + 1
          );
          const batchRes = await cpFetch("/api/uploads/parts/batch", {
            method: "POST",
            body: {
              session_id: create.sessionId,
              object_key: objectKey,
              upload_id: uploadId,
              part_numbers: partNumbers,
              user_id: this.opts.getUserId?.() ?? undefined,
            },
          });
          if (!batchRes.ok) throw new Error("Failed to get part URLs");
          const batch = (await batchRes.json()) as { parts: { partNumber: number; uploadUrl: string }[] };
          parts = parts.concat(batch.parts);
        }
      }

      const partProgress = new Array(totalParts).fill(0);
      let lastReport = 0;
      const report = () => {
        const now = Date.now();
        if (now - lastReport < 80) return;
        lastReport = now;
        const loaded = partProgress.reduce((a, b) => a + b, 0);
        let partsCompleted = 0;
        for (let i = 0; i < partProgress.length; i++) {
          const start = i * recommendedPartSize;
          const expected = Math.min(recommendedPartSize, file.size - start);
          if (partProgress[i] >= expected) partsCompleted++;
        }
        this.reportProgress(fileId, file.name, loaded, file.size, partsCompleted, totalParts, "uploading");
      };

      const getPartUrl = useLazyFetch
        ? this.createLazyPartUrlFetcher(
            create.sessionId,
            objectKey,
            uploadId,
            totalParts,
            parts,
            controller.signal,
            cpFetch
          )
        : null;

      const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);
      const conc = Math.min(recommendedConcurrency, 10);
      const uploadResults = await runWithConcurrency(
        partNumbers,
        conc,
        async (partNumber: number, idx: number) => {
          const url = getPartUrl
            ? await getPartUrl(partNumber)
            : (parts.find((p) => p.partNumber === partNumber) as { uploadUrl: string }).uploadUrl;
          const start = (partNumber - 1) * recommendedPartSize;
          const end = Math.min(start + recommendedPartSize, file.size);
          const blob = file.slice(start, end);
          const { etag, attempts } = await putPartWithRetry(blob, url, contentType, {
            signal: controller.signal,
            onBeforeSend: markFirstB2,
            onProgress: (loaded) => {
              partProgress[idx] = loaded;
              report();
            },
          });
          partRetrySum += Math.max(0, attempts - 1);
          partProgress[idx] = end - start;
          report();
          return { partNumber, etag };
        }
      );

      let completionOk = true;
      let finalizeOkMp = true;
      const completeRes = await cpFetch("/api/uploads/complete-upload", {
        method: "POST",
        body: {
          session_id: create.sessionId,
          object_key: objectKey,
          upload_id: uploadId,
          parts: uploadResults,
          drive_id: driveId,
          relative_path: relativePath,
          content_type: contentType,
          size_bytes: file.size,
          modified_at: file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString(),
          organization_id: organizationId ?? null,
          user_id: this.opts.getUserId?.() ?? undefined,
        },
      });
      if (!completeRes.ok) {
        completionOk = false;
        finalizeOkMp = false;
        const data = await completeRes.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to complete upload");
      }
      const complete = (await completeRes.json()) as { objectKey: string };
      this.reportProgress(fileId, file.name, file.size, file.size, totalParts, totalParts, "completed");
      try {
        await this.invokeOnComplete({ fileId, objectKey: complete.objectKey });
      } catch {
        finalizeOkMp = false;
      }
      emitSession({
        uploadMode: "multipart",
        fileSizeBytes: file.size,
        partSizeBytes: recommendedPartSize,
        concurrency: conc,
        totalParts,
        completionOk,
        finalizeOk: finalizeOkMp,
        outcome: finalizeOkMp ? "success" : "failure",
        ...(finalizeOkMp ? {} : { error: "onComplete_failed" }),
      });
      removeSession(fileId);
      return { objectKey: complete.objectKey };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      if (msg !== "Upload aborted") {
        this.opts.onError?.({ fileId, error: msg });
        emitSession({
          uploadMode: file.size >= MULTIPART_THRESHOLD_BYTES ? "multipart" : "single_put",
          fileSizeBytes: file.size,
          partSizeBytes: 0,
          concurrency: 1,
          totalParts: 0,
          completionOk: false,
          finalizeOk: false,
          outcome: "failure",
          error: msg,
        });
      }
      throw err;
    } finally {
      this.aborts.delete(fileId);
      this.progress.delete(fileId);
    }
  }

  private async sha256Hex(file: File): Promise<string> {
    const chunkSize = 8 * 1024 * 1024;
    if (file.size <= chunkSize) {
      const buf = await file.arrayBuffer();
      const hash = await crypto.subtle.digest("SHA-256", buf);
      return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
    const { createSHA256 } = await import("hash-wasm");
    const sha = await createSHA256();
    sha.init();
    let offset = 0;
    while (offset < file.size) {
      const chunk = file.slice(offset, offset + chunkSize);
      sha.update(new Uint8Array(await chunk.arrayBuffer()));
      offset += chunkSize;
    }
    return sha.digest("hex");
  }
}
