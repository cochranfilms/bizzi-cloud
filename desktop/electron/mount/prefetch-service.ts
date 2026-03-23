/**
 * Predictive Prefetch Service - Makes the mount feel like the fastest SSD.
 * Fetches from API/range layer into PrefetchCache — never reads through the mount.
 *
 * Strategies:
 * 1. Folder opened → Pre-cache first 30s of every clip (thumbnail + proxy preview)
 * 2. File read → Prefetch next 3 clips in sequence (editors work linearly ~80%)
 * 3. Grading session (large reads) → Pre-fetch full original + next 2 originals
 * 4. Idle 10+ min → Pre-warm cache for entire project's media
 */
import type { MountMetadataEntry } from "./webdav-server";
import type { PrefetchCache } from "./prefetch-cache";

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|heic|tiff|tif|arw|cr2|dng)$/i;

/** ~30 seconds at typical bitrate (10 Mbps ≈ 1.25 MB/s → 37.5 MB) */
const PREFETCH_HEAD_BYTES = 40 * 1024 * 1024; // 40 MB
const IDLE_MS = 10 * 60 * 1000; // 10 minutes
const CHECK_IDLE_INTERVAL_MS = 60 * 1000; // check every minute
const MAX_CONCURRENT_PREFETCH = 2;
/** Don't prefetch files modified in last N ms - NLE just wrote them; prefetch causes download loop */
const RECENT_UPLOAD_MS = 2 * 60 * 1000; // 2 minutes
const NEXT_CLIPS_COUNT = 3;
const GRADING_NEXT_FILES = 2;

function isVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}

function isMediaFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase()) || IMAGE_EXT.test(name.toLowerCase());
}

export interface PrefetchServiceOptions {
  apiBaseUrl: string;
  getAuthToken: () => Promise<string | null>;
  prefetchCache: PrefetchCache;
  onActivity?: () => void;
}

interface QueuedPrefetch {
  objectKey: string;
  sizeBytes: number;
  bytesToRead: number; // 0 = full file
  priority: "high" | "normal" | "low";
}

export class PrefetchService {
  private apiBaseUrl: string;
  private getAuthToken: () => Promise<string | null>;
  private prefetchCache: PrefetchCache;
  private onActivity?: () => void;
  private queue: QueuedPrefetch[] = [];
  private inFlight = 0;
  private lastActivityAt = 0;
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;
  private lastProjectFolder: { driveId: string; path: string; entries: MountMetadataEntry[] } | null = null;
  /** Avoid re-prefetch loop: once prefetched, skip until unmount */
  private prefetchedKeys = new Set<string>();

  constructor(options: PrefetchServiceOptions) {
    this.apiBaseUrl = options.apiBaseUrl;
    this.getAuthToken = options.getAuthToken;
    this.prefetchCache = options.prefetchCache;
    this.onActivity = options.onActivity;
  }

  private recordActivity(): void {
    this.lastActivityAt = Date.now();
    this.onActivity?.();
  }

  /** Called when user lists a folder (PROPFIND). Pre-cache first 30s of every clip. */
  onFolderListed(driveId: string | null, folderPath: string, entries: MountMetadataEntry[]): void {
    this.recordActivity();
    if (!driveId) return;

    const videoFiles = entries
      .filter((e) => e.type === "file" && isVideoFile(e.name))
      .sort((a, b) => {
        const aIsProxy = a.name.toLowerCase().endsWith("_proxy.mp4");
        const bIsProxy = b.name.toLowerCase().endsWith("_proxy.mp4");
        if (aIsProxy && !bIsProxy) return -1;
        if (!aIsProxy && bIsProxy) return 1;
        return 0;
      });
    if (videoFiles.length === 0) return;

    this.lastProjectFolder = { driveId, path: folderPath, entries };

    const now = Date.now();
    for (const e of videoFiles) {
      const mod = e.modified_at ? new Date(e.modified_at).getTime() : 0;
      if (mod && now - mod < RECENT_UPLOAD_MS) continue;
      if (!e.object_key) continue;
      this.enqueue({
        objectKey: e.object_key,
        sizeBytes: e.size_bytes,
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

    const isGradingRead = isVideo && rangeStart >= PREFETCH_HEAD_BYTES;
    if (isGradingRead) {
      const currentEntry = this.getEntryForPath(driveId, parentPath, fileName);
      if (currentEntry?.object_key) {
        this.enqueue({
          objectKey: currentEntry.object_key,
          sizeBytes: currentEntry.size_bytes,
          bytesToRead: 0,
          priority: "high",
        });
      }
      const siblingEntries = this.getSiblingEntries(driveId, parentPath, fileName);
      for (let i = 0; i < GRADING_NEXT_FILES && i < siblingEntries.length; i++) {
        const e = siblingEntries[i];
        if (e.object_key) {
          this.enqueue({
            objectKey: e.object_key,
            sizeBytes: e.size_bytes,
            bytesToRead: 0,
            priority: "high",
          });
        }
      }
      return;
    }

    if (isVideo) {
      const nextEntries = this.getSiblingEntries(driveId, parentPath, fileName).slice(0, NEXT_CLIPS_COUNT);
      for (const e of nextEntries) {
        if (e.object_key) {
          this.enqueue({
            objectKey: e.object_key,
            sizeBytes: e.size_bytes,
            bytesToRead: PREFETCH_HEAD_BYTES,
            priority: "normal",
          });
        }
      }
    }
  }

  private getEntryForPath(driveId: string, parentPath: string, fileName: string): MountMetadataEntry | null {
    const folder = this.lastProjectFolder;
    if (!folder || folder.driveId !== driveId || folder.path !== parentPath) return null;
    const fullPath = parentPath ? `${parentPath}/${fileName}` : fileName;
    return folder.entries.find(
      (e) => e.type === "file" && ((e.path && e.path === fullPath) || (!e.path && e.name === fileName))
    ) ?? null;
  }

  private getSiblingEntries(driveId: string, parentPath: string, currentFileName: string): MountMetadataEntry[] {
    const folder = this.lastProjectFolder;
    if (!folder || folder.driveId !== driveId || folder.path !== parentPath) return [];

    const currentPath = parentPath ? `${parentPath}/${currentFileName}` : currentFileName;
    const files = folder.entries
      .filter((e) => e.type === "file" && isVideoFile(e.name))
      .map((e) => ({ path: e.path || (parentPath ? `${parentPath}/${e.name}` : e.name), entry: e }))
      .sort((a, b) => a.path.localeCompare(b.path));
    const idx = files.findIndex((f) => f.path === currentPath);
    if (idx < 0) return [];
    return files.slice(idx + 1).map((f) => f.entry);
  }

  private enqueue(item: QueuedPrefetch): void {
    const key = `${item.objectKey}:${item.bytesToRead}`;
    if (this.prefetchedKeys.has(key)) return;
    if (this.queue.some((q) => `${q.objectKey}:${q.bytesToRead}` === key)) return;
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
    const key = `${item.objectKey}:${item.bytesToRead}`;
    const toRead = item.bytesToRead === 0 ? item.sizeBytes : Math.min(item.bytesToRead, item.sizeBytes);
    if (toRead <= 0) return;

    const token = await this.getAuthToken();
    if (!token) return;

    const rangeStart = 0;
    const rangeEnd = toRead - 1;
    const rangeUrl = `${this.apiBaseUrl}/api/mount/range?object_key=${encodeURIComponent(item.objectKey)}`;

    try {
      const res = await fetch(rangeUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Range: `bytes=${rangeStart}-${rangeEnd}`,
        },
      });
      if (!res.ok) return;
      const arrBuf = await res.arrayBuffer();
      const data = Buffer.from(arrBuf);
      await this.prefetchCache.put(item.objectKey, rangeStart, rangeEnd, data);
      this.prefetchedKeys.add(key);
    } catch {
      // Ignore; network or cache error
    }
  }

  /** Strategy 4: Idle 10+ min → pre-warm entire project. */
  private runIdlePrefetch(): void {
    if (Date.now() - this.lastActivityAt < IDLE_MS) return;
    const folder = this.lastProjectFolder;
    if (!folder) return;

    const now = Date.now();
    const mediaFiles = folder.entries.filter((e) => {
      if (e.type !== "file" || !isMediaFile(e.name)) return false;
      const mod = e.modified_at ? new Date(e.modified_at).getTime() : 0;
      if (mod && now - mod < RECENT_UPLOAD_MS) return false;
      return true;
    });
    const relPrefix = folder.path ? `${folder.path}/` : "";
    for (const e of mediaFiles) {
      if (!e.object_key) continue;
      this.enqueue({
        objectKey: e.object_key,
        sizeBytes: e.size_bytes,
        bytesToRead: isVideoFile(e.name) ? PREFETCH_HEAD_BYTES : 0,
        priority: "low",
      });
    }
    this.lastProjectFolder = null;
  }

  /** Start idle check timer. Call when mount is active. */
  start(): void {
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
    this.prefetchedKeys.clear();
  }
}
