import * as fs from "fs";
import * as path from "path";
import {
  type StreamCacheEntry,
  CHUNK_SIZE_BYTES,
  DEFAULT_STREAM_CACHE_MAX_BYTES,
} from "../types/mount";

const INDEX_FILE = "stream-cache-index.json";

function chunkKey(objectKey: string, start: number, end: number): string {
  const safe = objectKey.replace(/[/\\:]/g, "_");
  return `${safe}_${start}_${end}.chunk`;
}

export class StreamCacheManager {
  private cacheDir: string;
  private indexPath: string;
  private maxBytes: number;
  private index: Map<string, StreamCacheEntry> = new Map();
  private totalBytes = 0;
  private dirty = false;

  constructor(
    baseDir: string,
    maxBytes: number = DEFAULT_STREAM_CACHE_MAX_BYTES
  ) {
    this.cacheDir = path.join(baseDir, "stream-cache");
    this.indexPath = path.join(this.cacheDir, INDEX_FILE);
    this.maxBytes = maxBytes;
  }

  async init(): Promise<void> {
    await fs.promises.mkdir(this.cacheDir, { recursive: true });
    await this.loadIndex();
  }

  private async loadIndex(): Promise<void> {
    try {
      const raw = await fs.promises.readFile(this.indexPath, "utf-8");
      const arr = JSON.parse(raw) as StreamCacheEntry[];
      this.index.clear();
      this.totalBytes = 0;
      for (const e of arr) {
        if (
          e &&
          typeof e.key === "string" &&
          typeof e.size_bytes === "number" &&
          typeof e.local_path === "string"
        ) {
          this.index.set(e.key, e);
          this.totalBytes += e.size_bytes;
        }
      }
    } catch {
      this.index.clear();
      this.totalBytes = 0;
    }
    this.dirty = false;
  }

  private async saveIndex(): Promise<void> {
    if (!this.dirty) return;
    const arr = Array.from(this.index.values());
    await fs.promises.writeFile(
      this.indexPath,
      JSON.stringify(arr, null, 0),
      "utf-8"
    );
    this.dirty = false;
  }

  async getChunk(
    objectKey: string,
    start: number,
    end: number
  ): Promise<Buffer | null> {
    const key = `${objectKey}:${start}-${end}`;
    const entry = this.index.get(key);
    if (!entry) return null;

    try {
      const buf = await fs.promises.readFile(entry.local_path);
      entry.last_accessed_at = Date.now();
      this.dirty = true;
      await this.saveIndex();
      return buf;
    } catch {
      this.index.delete(key);
      this.totalBytes -= entry.size_bytes;
      this.dirty = true;
      await this.saveIndex();
      return null;
    }
  }

  async putChunk(
    objectKey: string,
    start: number,
    end: number,
    data: Buffer
  ): Promise<void> {
    await this.evictUntil(Math.max(0, this.totalBytes + data.length - this.maxBytes));

    const key = `${objectKey}:${start}-${end}`;
    const filename = chunkKey(objectKey, start, end);
    const localPath = path.join(this.cacheDir, filename);

    await fs.promises.writeFile(localPath, data);

    const now = Date.now();
    const entry: StreamCacheEntry = {
      key,
      object_key: objectKey,
      start,
      end,
      local_path: localPath,
      size_bytes: data.length,
      last_accessed_at: now,
      created_at: now,
    };
    this.index.set(key, entry);
    this.totalBytes += data.length;
    this.dirty = true;
    await this.saveIndex();
  }

  private async evictUntil(bytesToFree: number): Promise<void> {
    if (bytesToFree <= 0) return;

    const sorted = Array.from(this.index.values()).sort(
      (a, b) => a.last_accessed_at - b.last_accessed_at
    );
    let freed = 0;
    for (const entry of sorted) {
      if (freed >= bytesToFree) break;
      try {
        await fs.promises.unlink(entry.local_path);
      } catch {
        // ignore
      }
      this.index.delete(entry.key);
      this.totalBytes -= entry.size_bytes;
      freed += entry.size_bytes;
      this.dirty = true;
    }
    await this.saveIndex();
  }

  async evictLRU(untilUnderBytes: number): Promise<void> {
    if (this.totalBytes <= untilUnderBytes) return;
    await this.evictUntil(this.totalBytes - untilUnderBytes);
  }

  getTotalSize(): number {
    return this.totalBytes;
  }

  getMaxBytes(): number {
    return this.maxBytes;
  }

  setMaxBytes(bytes: number): void {
    this.maxBytes = bytes;
  }

  async clear(): Promise<void> {
    for (const entry of this.index.values()) {
      try {
        await fs.promises.unlink(entry.local_path);
      } catch {
        // ignore
      }
    }
    this.index.clear();
    this.totalBytes = 0;
    this.dirty = true;
    await this.saveIndex();
  }

  /** Compute chunk ranges for a byte range (aligned to CHUNK_SIZE) */
  static getChunkRanges(
    start: number,
    end: number
  ): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = [];
    let s = Math.floor(start / CHUNK_SIZE_BYTES) * CHUNK_SIZE_BYTES;
    while (s <= end) {
      const e = Math.min(s + CHUNK_SIZE_BYTES - 1, end);
      ranges.push({ start: s, end: e });
      s += CHUNK_SIZE_BYTES;
    }
    return ranges;
  }
}
