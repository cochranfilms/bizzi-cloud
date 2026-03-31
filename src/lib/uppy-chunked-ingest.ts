/**
 * Chunked intake pipeline — primary path for adding many files to Uppy without blocking the main thread.
 * Yields between chunks via requestIdleCallback (with timeout), then rAF, then setTimeout(0).
 */

import type Uppy from "@uppy/core";
import type { Meta, Body } from "@uppy/core";
import type { MinimalRequiredUppyFile } from "@uppy/utils";
import type { BatchTier } from "@/lib/uppy-mass-upload-constants";
import { getIngestChunkSize } from "@/lib/uppy-mass-upload-constants";
import type { MassUploadDebug } from "@/lib/uppy-mass-upload-debug";

/** Feature-detect idle scheduling (Safari < 15 lacked requestIdleCallback in some builds). */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout: 64 });
      return;
    }
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(() => resolve(), 0);
  });
}

export type RunChunkedIngestOptions<M extends Meta, B extends Body> = {
  uppy: Uppy<M, B>;
  files: File[];
  /** Maps a slice of files to Uppy descriptors (name + data; match prior addFile shape). */
  toDescriptors: (slice: File[]) => MinimalRequiredUppyFile<M, B>[];
  batchTier: BatchTier;
  /** Called after each successful chunk with cumulative count added and total target. */
  onProgress?: (addedSoFar: number, total: number) => void;
  signal?: AbortSignal;
  debug?: MassUploadDebug | null;
};

/**
 * Splits `files` into chunks, calls `uppy.addFiles` per chunk, yields between chunks.
 * Uppy still emits `file-added` per file within each chunk — chunking bounds synchronous burst size.
 */
export async function runChunkedIngest<M extends Meta, B extends Body>(
  opts: RunChunkedIngestOptions<M, B>
): Promise<{ added: number; canceled: boolean }> {
  const { uppy, files, toDescriptors, batchTier, onProgress, signal, debug } = opts;
  const chunkSize = getIngestChunkSize(batchTier);
  const total = files.length;
  let added = 0;
  const t0 =
    typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

  for (let i = 0; i < total; i += chunkSize) {
    if (signal?.aborted) {
      debug?.log("ingest_canceled", { added, total });
      return { added, canceled: true };
    }
    const slice = files.slice(i, i + chunkSize);
    const descriptors = toDescriptors(slice);
    if (descriptors.length > 0) {
      try {
        uppy.addFiles(descriptors);
      } catch {
        /* restriction / duplicate — continue with next chunk */
      }
    }
    added += slice.length;
    onProgress?.(added, total);
    if (i + chunkSize < total) {
      await yieldToMain();
    }
  }

  const t1 =
    typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  debug?.log("ingest_chunks_done", {
    total,
    added,
    chunkSize,
    tier: batchTier,
    ms: Math.round(t1 - t0),
  });

  return { added, canceled: false };
}
