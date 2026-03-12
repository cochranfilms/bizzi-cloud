/**
 * Predictive Prefetch Service - Makes the mount feel like the fastest SSD.
 *
 * Strategies:
 * 1. Folder opened → Pre-cache first 30s of every clip (thumbnail + proxy preview)
 * 2. File read → Prefetch next 3 clips in sequence (editors work linearly ~80%)
 * 3. Grading session (large reads) → Pre-fetch full original + next 2 originals
 * 4. Idle 10+ min → Pre-warm cache for entire project's media
 */
import * as fs from "fs";
import * as path from "path";
import type { MountMetadataEntry } from "./webdav-server";

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|heic|tiff|tif|arw|cr2|dng)$/i;

/** ~30 seconds at typical bitrate (10 Mbps ≈ 1.25 MB/s → 37.5 MB) */
const PREFETCH_HEAD_BYTES = 40 * 1024 * 1024; // 40 MB
const IDLE_MS = 10 * 60 * 1000; // 10 minutes
const CHECK_IDLE_INTERVAL_MS = 60 * 1000; // check every minute
const MAX_CONCURRENT_PREFETCH = 2;
const NEXT_CLIPS_COUNT = 3;
const GRADING_NEXT_FILES = 2;

function isVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}

function isMediaFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase()) || IMAGE_EXT.test(name.toLowerCase());
}

export interface PrefetchServiceOptions {
  mountPoint: string;
  onActivity?: () => void;
}

interface QueuedPrefetch {
  driveId: string;
  relativePath: string;
  bytesToRead: number; // 0 = full file
  priority: "high" | "normal" | "low";
}

export class PrefetchService {
  private mountPoint: string;
  private onActivity?: () => void;
  private queue: QueuedPrefetch[] = [];
  private inFlight = 0;
  private lastActivityAt = 0;
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;
  private lastProjectFolder: { driveId: string; path: string; entries: MountMetadataEntry[] } | null = null;

  constructor(options: PrefetchServiceOptions) {
    this.mountPoint = options.mountPoint;
    this.onActivity = options.onActivity;
  }

  private recordActivity(): void {
    this.lastActivityAt = Date.now();
    this.onActivity?.();
  }

  /** Called when user lists a folder (PROPFIND). Pre-cache first 30s of every clip. */
  onFolderListed(driveId: string | null, folderPath: string, entries: MountMetadataEntry[]): void {
    this.recordActivity();
    if (!driveId) return; // root or top-level, no path

    const videoFiles = entries.filter((e) => e.type === "file" && isVideoFile(e.name));
    if (videoFiles.length === 0) return;

    // Store for idle prefetch and "next clips" heuristic
    this.lastProjectFolder = { driveId, path: folderPath, entries };

    // Strategy 1: Pre-cache first 30s of every clip when folder is opened
    const relPath = folderPath ? `${folderPath}/` : "";
    for (const e of videoFiles) {
      this.enqueue({
        driveId,
        relativePath: `${relPath}${e.name}`,
        bytesToRead: PREFETCH_HEAD_BYTES,
        priority: "low",
      });
    }
  }

  /** Called when user reads a file (GET). Prefetch next clips / detect grading. */
  onFileRead(driveId: string, relativePath: string, rangeStart: number, rangeEnd: number | null): void {
    this.recordActivity();

    const fileName = relativePath.split("/").pop() ?? "";
    const parentPath = relativePath.includes("/") ? relativePath.slice(0, relativePath.lastIndexOf("/")) : "";
    const isVideo = isVideoFile(fileName);

    // Strategy 3: Grading session - NLE accessing beyond first 30s of original
    const isGradingRead = isVideo && rangeStart >= PREFETCH_HEAD_BYTES;
    if (isGradingRead) {
      // Pre-fetch full file + next 2 originals in folder
      this.enqueue({ driveId, relativePath, bytesToRead: 0, priority: "high" });
      const siblings = this.getSiblings(driveId, parentPath, fileName);
      for (let i = 0; i < GRADING_NEXT_FILES && i < siblings.length; i++) {
        this.enqueue({
          driveId,
          relativePath: siblings[i],
          bytesToRead: 0,
          priority: "high",
        });
      }
      return;
    }

    // Strategy 2: Clip clicked → prefetch next 3 clips in sequence
    if (isVideo) {
      const nextPaths = this.getNextFilesInSequence(driveId, parentPath, fileName, NEXT_CLIPS_COUNT);
      for (const p of nextPaths) {
        this.enqueue({
          driveId,
          relativePath: p,
          bytesToRead: PREFETCH_HEAD_BYTES,
          priority: "normal",
        });
      }
    }
  }

  private getSiblings(driveId: string, parentPath: string, currentFileName: string): string[] {
    const folder = this.lastProjectFolder;
    if (!folder || folder.driveId !== driveId || folder.path !== parentPath) return [];

    const currentPath = parentPath ? `${parentPath}/${currentFileName}` : currentFileName;
    const files = folder.entries
      .filter((e) => e.type === "file" && isVideoFile(e.name))
      .map((e) => e.path || (parentPath ? `${parentPath}/${e.name}` : e.name))
      .sort();
    const idx = files.indexOf(currentPath);
    if (idx < 0) return [];
    return files.slice(idx + 1);
  }

  private getNextFilesInSequence(driveId: string, parentPath: string, currentFileName: string, count: number): string[] {
    return this.getSiblings(driveId, parentPath, currentFileName).slice(0, count);
  }

  private enqueue(item: QueuedPrefetch): void {
    const key = `${item.driveId}:${item.relativePath}:${item.bytesToRead}`;
    if (this.queue.some((q) => `${q.driveId}:${q.relativePath}:${q.bytesToRead}` === key)) return;
    this.queue.push(item);
    this.queue.sort((a, b) => {
      const p = { high: 0, normal: 1, low: 2 };
      return p[a.priority] - p[b.priority];
    });
    this.drainQueue();
  }

  private drainQueue(): void {
    while (this.inFlight < MAX_CONCURRENT_PREFETCH && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.inFlight++;
      this.prefetchOne(item).finally(() => {
        this.inFlight--;
        this.drainQueue();
      });
    }
  }

  private async prefetchOne(item: QueuedPrefetch): Promise<void> {
    const fullPath = path.join(this.mountPoint, item.driveId, item.relativePath);
    try {
      const stat = await fs.promises.stat(fullPath).catch(() => null);
      if (!stat || !stat.isFile()) return;

      const size = stat.size;
      const toRead = item.bytesToRead === 0 ? size : Math.min(item.bytesToRead, size);
      if (toRead <= 0) return;

      const buf = Buffer.alloc(Math.min(toRead, 4 * 1024 * 1024)); // 4MB chunks
      const fd = await fs.promises.open(fullPath, "r");
      try {
        let offset = 0;
        while (offset < toRead) {
          const len = Math.min(buf.length, toRead - offset);
          await fd.read(buf, 0, len, offset);
          offset += len;
        }
      } finally {
        await fd.close();
      }
    } catch {
      // Ignore; file may not exist or mount may be busy
    }
  }

  /** Strategy 4: Idle 10+ min → pre-warm entire project. */
  private runIdlePrefetch(): void {
    if (Date.now() - this.lastActivityAt < IDLE_MS) return;
    const folder = this.lastProjectFolder;
    if (!folder) return;

    const mediaFiles = folder.entries.filter((e) => e.type === "file" && isMediaFile(e.name));
    const relPrefix = folder.path ? `${folder.path}/` : "";
    for (const e of mediaFiles) {
      this.enqueue({
        driveId: folder.driveId,
        relativePath: `${relPrefix}${e.name}`,
        bytesToRead: isVideoFile(e.name) ? PREFETCH_HEAD_BYTES : 0,
        priority: "low",
      });
    }
    this.lastProjectFolder = null; // avoid re-queuing same folder every interval
  }

  /** Start idle check timer. Call when mount is active. */
  start(mountPoint: string): void {
    this.mountPoint = mountPoint;
    this.lastActivityAt = Date.now();
    this.stop();
    this.idleCheckTimer = setInterval(() => this.runIdlePrefetch(), CHECK_IDLE_INTERVAL_MS);
  }

  stop(): void {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
    this.queue = [];
    this.lastProjectFolder = null;
  }
}
